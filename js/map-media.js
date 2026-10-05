import { mapItems, getMapPreviewPoster, reelChapterSources } from "./map-data.js";
import { reducedMotion, typographUiText } from "./preferences.js";

const mapInspector = document.querySelector("[data-map-inspector]");
const observationShowcase = document.querySelector("[data-observation-showcase]");
const observationPreview = document.querySelector("[data-observation-preview]");
const mapPreview = document.querySelector("[data-map-preview]");
const mapPreviewVideo = document.querySelector("[data-map-preview-video]");
const mapPreviewMedia = mapPreview?.querySelector(".map-hover-preview__media");
const mapPreviewIndex = document.querySelector("[data-map-preview-index]");
const mapPreviewTitle = document.querySelector("[data-map-preview-title]");
const mapPreviewMeta = document.querySelector("[data-map-preview-meta]");
// Autoplay rejection keeps the receiver on its poster.
const playVideo = video => video.play().catch(() => {});
const reelItems = mapItems.filter((item) => item.previewVideo);
const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
const compactMapViewport = window.matchMedia("(max-width: 900px)");
const reelMosaicQuery = new URLSearchParams(window.location.search);
const reelMosaicMode = reelMosaicQuery.get("reel");
const reelMosaicEnabled = reelMosaicMode !== "single";
const reelMosaicReviewActive = ["mosaic", "eleven-mosaic"]
  .includes(reelMosaicMode) || reelMosaicQuery.has("preview");
const reelMosaicInitialId = reelMosaicMode === "eleven-mosaic"
  ? "eleven"
  : reelMosaicQuery.get("preview") || "eleven";
const reelMosaicVideos = [];
let previewHideTimer = 0;
let previewShowFrame = 0;
let activePreviewItem = null;

if (
  reelMosaicEnabled
  && mapPreview
  && mapPreviewMedia
  && mapPreviewVideo
) {
  const mainFrame = document.createElement("div");
  const mosaic = document.createElement("div");

  mainFrame.className = "map-hover-preview__mosaic-main";
  mosaic.className = "map-hover-preview__mosaic";
  mosaic.setAttribute("aria-hidden", "true");
  mapPreview.dataset.reelLayout = "mosaic";
  mapPreviewMedia.insertBefore(mainFrame, mapPreviewVideo);
  mainFrame.append(mapPreviewVideo);

  ["context", "detail"].forEach((slot) => {
    const slotFrame = document.createElement("div");
    const video = document.createElement("video");

    slotFrame.className = `map-hover-preview__mosaic-slot map-hover-preview__mosaic-slot--${slot}`;
    video.className = `map-hover-preview__mosaic-video map-hover-preview__mosaic-video--${slot}`;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = true;
    video.tabIndex = -1;

    video.addEventListener("canplay", () => {
      video.dataset.ready = "true";

      if (
        mapPreview.classList.contains("has-reel-mosaic")
        && reelMosaicVideos.every(
          (candidate) => candidate.dataset.ready === "true",
        )
      ) {
        mapPreview.classList.add("is-mosaic-ready");
      }
    });

    reelMosaicVideos.push(video);
    slotFrame.append(video);
    mosaic.append(slotFrame);
  });

  mapPreviewMedia.append(mosaic);
}

const observationVideo = document.createElement("video");
observationVideo.className = "observation-video";
observationVideo.muted = true;
observationVideo.playsInline = true;
observationVideo.preload = "none";
observationVideo.setAttribute("aria-hidden", "true");
let observationMediaStep = null;
let observationMediaPaused = true;
let observationScene = 0;

const setObservationPlayback = (paused) => {
  observationMediaPaused = paused;
  if (paused || reducedMotion.matches || document.hidden || !observationVideo.getAttribute("src")) {
    observationVideo.pause();
  } else {
    playVideo(observationVideo);
  }
};
observationVideo.addEventListener("loadeddata", () => {
  const start = observationMediaStep?.scenes?.[0]?.[0] || 0;
  if (start) observationVideo.currentTime = start;
  setObservationPlayback(observationMediaPaused);
});
observationVideo.addEventListener("timeupdate", () => {
  const scenes = observationMediaStep?.scenes;
  if (!scenes || observationVideo.seeking || observationVideo.paused) return;
  if (observationVideo.currentTime >= scenes[observationScene][1] - 0.06) {
    observationScene = (observationScene + 1) % scenes.length;
    observationVideo.currentTime = scenes[observationScene][0];
  }
});

const syncObservationPreview = () => {
  const id = observationShowcase?.dataset.activeId;
  const plane = observationShowcase?.querySelector(`[data-observation-showcase-id="${id}"]`);
  observationPreview.hidden = !compactMapViewport.matches || !plane;
  if (!plane) return;
  if (!observationPreview.hidden) {
    observationPreview.replaceChildren(...[...plane.querySelectorAll("img")].map(image => image.cloneNode()));
  }
  const parent = compactMapViewport.matches ? observationPreview : plane;
  if (observationVideo.dataset.previewId === id) parent.append(observationVideo);
  setObservationPlayback(observationMediaPaused);
};
compactMapViewport.addEventListener("change", syncObservationPreview);
reducedMotion.addEventListener("change", () => setObservationPlayback(observationMediaPaused));

const renderObservationShowcase = (step = {}) => {
  const activeId = step.showcaseId || step.itemId || "";
  const planes = [...observationShowcase.querySelectorAll("[data-observation-showcase-id]")];
  const progress = planes.findIndex(plane => plane.dataset.observationShowcaseId === activeId);
  const isVisible = progress >= 0;
  observationMediaStep = step;
  observationScene = 0;
  observationVideo.pause();
  observationShowcase.classList.toggle("is-visible", isVisible);
  observationShowcase.dataset.activeId = isVisible ? activeId : "";
  if (isVisible) {
    planes.forEach((plane, index) => {
      const delta = index - progress;
      const distance = Math.abs(delta);
      plane.querySelectorAll("img[data-src]").forEach(image => {
        image.src = image.dataset.src;
        delete image.dataset.src;
      });
      const previewItem = mapItems.find(item => item.id === plane.dataset.observationShowcaseId);
      if (previewItem?.previewVideo) {
        plane.querySelector("img").src = delta === 0 && step.poster
          ? step.poster : getMapPreviewPoster(previewItem);
      }
      plane.classList.toggle("is-active", delta === 0);
      const properties = {
        x: `${delta * 14}vw`, y: `${(delta < 0 ? 1 : -1) * Math.min(28, distance * 17)}vh`,
        scale: delta === 0 ? 1 : 0.6, opacity: delta === 0 ? 1 : distance === 1 ? 0.18 : 0,
        blur: `${delta === 0 ? 0 : 4}px`, saturation: delta === 0 ? 1 : 0.72,
        rotation: `${delta * -0.8}deg`, z: delta === 0 ? 9 : 1,
      };
      Object.entries(properties).forEach(([name, value]) => plane.style.setProperty(`--showcase-${name}`, value));
    });
  }
  const item = mapItems.find(item => item.id === activeId);
  if (!isVisible || !item?.previewVideo || step.poster || reducedMotion.matches) {
    observationVideo.remove();
    observationVideo.removeAttribute("src");
    delete observationVideo.dataset.previewId;
    observationVideo.load();
  } else if (observationVideo.dataset.previewId !== activeId) {
    observationVideo.dataset.previewId = activeId;
    observationVideo.poster = getMapPreviewPoster(item);
    observationVideo.src = item.previewVideo;
    observationVideo.loop = !step.scenes;
  }
  syncObservationPreview();
};

const pauseReelMosaic = () => {
  reelMosaicVideos.forEach((video) => video.pause());
};

const showReelMosaic = (item, posterPath) => {
  const chapterSources = reelChapterSources.get(item.id) ?? [];
  const mosaicActive = reelMosaicEnabled
    && hoverCapable.matches
    && !compactMapViewport.matches
    && chapterSources.length === reelMosaicVideos.length;
  const sourceChanged = reelMosaicVideos.some(
    (video) => video.dataset.previewId !== item.id,
  );

  mapPreview?.classList.toggle("has-reel-mosaic", mosaicActive);

  if (!mosaicActive) {
    mapPreview?.classList.remove("is-mosaic-ready");
    pauseReelMosaic();
    return;
  }

  if (sourceChanged) {
    mapPreview?.classList.remove("is-mosaic-ready");
  }

  reelMosaicVideos.forEach((video, index) => {
    const chapterSource = chapterSources[index];

    if (
      video.dataset.previewId !== item.id
      || video.dataset.chapterSource !== chapterSource
    ) {
      delete video.dataset.ready;
      video.dataset.previewId = item.id;
      video.dataset.chapterSource = chapterSource;
      video.poster = posterPath;
      video.src = chapterSource;
    } else if (video.readyState >= 1) {
      video.currentTime = 0;
    }

    if (reducedMotion.matches) {
      video.pause();
    } else {
      playVideo(video);
    }
  });
};

const hideMapPreview = ({ immediate = false } = {}) => {
  window.clearTimeout(previewHideTimer);
  window.cancelAnimationFrame(previewShowFrame);
  previewShowFrame = 0;

  const hide = () => {
    mapPreview?.classList.remove("is-visible");
    mapPreview?.setAttribute("aria-hidden", "true");
    mapPreviewVideo?.pause();
    pauseReelMosaic();
    activePreviewItem = null;
  };

  if (immediate) {
    hide();
  } else {
    previewHideTimer = window.setTimeout(hide, 90);
  }
};

// Hover is a transient preview inside the map; the four persistent consoles
// keep their place. Choose the nearest clear position using the actual frames.
const placeMapPreview = () => {
  const gap = 16;
  const consoles = [...document.querySelectorAll('[data-floating-console]')]
    .filter(element => getComputedStyle(element).visibility !== 'hidden')
    .map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
  for (const property of ['--preview-offset-x', '--preview-offset-y', '--preview-fit-width']) mapPreview.style.removeProperty(property);
  mapPreview.classList.remove('is-compact-preview');
  // Measure the final layout, independently of the entrance animation.
  mapPreview.style.animation = 'none';
  mapPreview.style.transition = 'none';
  mapPreview.style.transform = 'translate(-50%, -50%)';
  const naturalWidth = mapPreview.getBoundingClientRect().width;
  const frames = () => [...mapPreview.querySelectorAll(mapPreview.classList.contains('has-reel-mosaic')
    ? '.map-hover-preview__mosaic-main, .map-hover-preview__mosaic-slot, .map-hover-preview__readout'
    : '.map-hover-preview__media, .map-hover-preview__readout')]
    .map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
  const findPosition = () => {
    const boxes = frames(), xs = new Set([0]), ys = new Set([0]);
    for (const box of boxes) {
      xs.add(gap - box.left); xs.add(innerWidth - gap - box.right);
      ys.add(gap - box.top); ys.add(innerHeight - gap - box.bottom);
      for (const obstacle of consoles) {
        xs.add(obstacle.left - gap - box.right); xs.add(obstacle.right + gap - box.left);
        ys.add(obstacle.top - gap - box.bottom); ys.add(obstacle.bottom + gap - box.top);
      }
    }
    let best = null;
    for (const x of xs) for (const y of ys) {
      if (best && x*x + y*y >= best.distance) continue;
      if (boxes.some(box => box.left+x < gap-.5 || box.right+x > innerWidth-gap+.5
        || box.top+y < gap-.5 || box.bottom+y > innerHeight-gap+.5
        || consoles.some(obstacle => box.left+x < obstacle.right+gap-.5 && box.right+x > obstacle.left-gap+.5
          && box.top+y < obstacle.bottom+gap-.5 && box.bottom+y > obstacle.top-gap+.5))) continue;
      best = { x, y, distance: x*x + y*y };
    }
    return best;
  };
  let position = findPosition();
  if (!position) {
    mapPreview.classList.add('is-compact-preview');
    const starts = [gap, ...consoles.map(rect => rect.right + gap)];
    const ends = [innerWidth - gap, ...consoles.map(rect => rect.left - gap)];
    const widths = new Set(starts.flatMap(left => ends.map(right => Math.min(naturalWidth, right - left))));
    for (let width = naturalWidth; width >= 176; width = Math.floor(width * .86)) widths.add(width);
    for (const width of [...widths].filter(width => width >= 176).sort((a, b) => b - a)) {
      mapPreview.style.setProperty('--preview-fit-width', `${width}px`);
      position = findPosition();
      if (position) break;
    }
  }
  if (position) {
    mapPreview.style.setProperty('--preview-offset-x', `${position.x}px`);
    mapPreview.style.setProperty('--preview-offset-y', `${position.y}px`);
  }
  for (const property of ['animation', 'transition', 'transform']) mapPreview.style.removeProperty(property);
  return Boolean(position);
};
let previewLayoutFrame = 0;
const scheduleMapPreviewPlacement = () => {
  cancelAnimationFrame(previewLayoutFrame);
  if (mapPreview?.classList.contains('is-visible')) previewLayoutFrame = requestAnimationFrame(() => {
    if (!placeMapPreview()) hideMapPreview({ immediate: true });
  });
};
window.addEventListener('resize', scheduleMapPreviewPlacement, { passive: true });
const previewConsoleResize = new ResizeObserver(scheduleMapPreviewPlacement);
document.querySelectorAll('[data-floating-console]').forEach(element => previewConsoleResize.observe(element));

const showMapPreview = (item) => {
  if (
    !mapPreview
    || !mapPreviewVideo
    || !item.previewVideo
    || !hoverCapable.matches
    || compactMapViewport.matches
    || mapInspector?.classList.contains("is-open")
  ) {
    hideMapPreview({ immediate: true });
    return;
  }

  window.clearTimeout(previewHideTimer);
  activePreviewItem = item;
  mapPreview.style.setProperty("--reel-progress", "0");

  mapPreview.classList.add("has-video");
  mapPreview.classList.toggle(
    "is-landscape",
    item.previewOrientation === "landscape",
  );

  if (mapPreviewIndex) {
    const reelIndex = reelItems.findIndex((candidate) => candidate.id === item.id);
    mapPreviewIndex.textContent = `${String(reelIndex + 1).padStart(2, "0")} / ${String(reelItems.length).padStart(2, "0")}`;
  }

  if (mapPreviewTitle) {
    mapPreviewTitle.textContent = typographUiText(item.mapLabel || item.title);
  }

  if (mapPreviewMeta) {
    mapPreviewMeta.textContent = typographUiText(item.previewMeta);
  }

  const posterPath = getMapPreviewPoster(item);

  showReelMosaic(item, posterPath);

  if (mapPreviewVideo.dataset.posterId !== item.id) {
    mapPreviewVideo.dataset.posterId = item.id;
    mapPreviewVideo.poster = posterPath;
    mapPreview.classList.add("has-poster");
  }

  if (mapPreviewVideo.dataset.previewId !== item.id) {
    mapPreview.classList.remove("is-video-ready");
    mapPreviewVideo.dataset.previewId = item.id;
    mapPreviewVideo.src = item.previewVideo;
  }

  if (mapPreviewVideo.readyState >= 1) {
    mapPreviewVideo.currentTime = item.previewStart || 0;
  }

  if (reducedMotion.matches) {
    mapPreviewVideo.pause();
  } else {
    playVideo(mapPreviewVideo);
  }

  previewShowFrame = window.requestAnimationFrame(() => {
    previewShowFrame = 0;

    if (!mapInspector?.classList.contains("is-open")) {
      if (placeMapPreview()) mapPreview.classList.add("is-visible");
      else hideMapPreview({ immediate: true });
    }
  });
};

mapPreviewVideo?.addEventListener("canplay", () => {
  mapPreview?.classList.add("is-video-ready");
});

mapPreviewVideo?.addEventListener("loadedmetadata", () => {
  if (!activePreviewItem) {
    return;
  }

  mapPreviewVideo.currentTime = activePreviewItem.previewStart || 0;

  if (reducedMotion.matches) {
    mapPreviewVideo.pause();
  }
});

mapPreviewVideo?.addEventListener("timeupdate", () => {
  if (!activePreviewItem) {
    return;
  }

  const previewStart = activePreviewItem.previewStart || 0;
  const previewDuration = activePreviewItem.previewDuration
    || mapPreviewVideo.duration
    || 1;
  const elapsed = Math.max(0, mapPreviewVideo.currentTime - previewStart);
  const progress = Math.min(1, elapsed / previewDuration);

  mapPreview?.style.setProperty("--reel-progress", String(progress));

  if (
    activePreviewItem.previewDuration
    && mapPreviewVideo.currentTime >= previewStart + activePreviewItem.previewDuration
  ) {
    mapPreviewVideo.currentTime = previewStart;
    playVideo(mapPreviewVideo);
  }
});

reducedMotion.addEventListener?.("change", () => {
  if (!mapPreviewVideo || !activePreviewItem) {
    return;
  }

  if (reducedMotion.matches) {
    mapPreviewVideo.pause();
    pauseReelMosaic();
  } else if (mapPreview?.classList.contains("is-visible")) {
    playVideo(mapPreviewVideo);
    reelMosaicVideos.forEach(playVideo);
  }
});

const initializeReelReview = () => {
  if (
    reelMosaicReviewActive
    && hoverCapable.matches
    && !compactMapViewport.matches
  ) {
    const initialMosaicItem = mapItems.find(
      (item) => item.id === reelMosaicInitialId && reelChapterSources.has(item.id),
    ) ?? mapItems.find((item) => item.id === "eleven");
  
    if (initialMosaicItem) {
      window.requestAnimationFrame(() => showMapPreview(initialMosaicItem));
    }
  }
};

const pauseMapPreviewPlayback = () => {
  mapPreviewVideo?.pause();
  pauseReelMosaic();
};

const isMapPreviewActive = () => Boolean(activePreviewItem || mapPreview?.classList.contains("is-visible"));

export { isMapPreviewActive, showMapPreview, hideMapPreview, pauseMapPreviewPlayback, initializeReelReview, renderObservationShowcase, setObservationPlayback };
