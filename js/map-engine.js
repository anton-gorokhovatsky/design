// Runtime module 5/7: spatial map, relations, filters, and observation route.
import { trackPortfolioEvent } from "./analytics.js";
import {
  mapItems,
  principlesSourceHref,
  reelChapterSources,
} from "./map-data.js";
import {
  reducedMotion,
  typographUiText,
} from "./preferences.js";
import {
  signalField,
  svgNamespace,
} from "./signal-field.js";

const mapNodesRoot = document.querySelector("[data-map-nodes]");
const mapLabelsRoot = document.querySelector("[data-map-labels]");
const mapSpecksRoot = document.querySelector("[data-map-specks]");
const mapLinksRoot = document.querySelector("[data-map-links]");
const mapKind = document.querySelector("[data-map-kind]");
const mapTitle = document.querySelector("[data-map-title]");
const mapMeta = document.querySelector("[data-map-meta]");
const mapDescription = document.querySelector("[data-map-description]");
const mapLink = document.querySelector("[data-map-link]");
const mapInspector = document.querySelector("[data-map-inspector]");
const inspectorClose = document.querySelector("[data-close-inspector]");
const mapPreview = document.querySelector("[data-map-preview]");
const mapPreviewVideo = document.querySelector("[data-map-preview-video]");
const mapPreviewMedia = mapPreview?.querySelector(".map-hover-preview__media");
const mapPreviewIndex = document.querySelector("[data-map-preview-index]");
const mapPreviewTitle = document.querySelector("[data-map-preview-title]");
const mapPreviewMeta = document.querySelector("[data-map-preview-meta]");
const mapEvidence = document.querySelector("[data-map-evidence]");
const mapEvidenceTask = document.querySelector("[data-map-evidence-task]");
const mapEvidenceRole = document.querySelector("[data-map-evidence-role]");
const mapEvidenceResult = document.querySelector("[data-map-evidence-result]");
const mapNote = document.querySelector("[data-map-note]");
const timeToggle = document.querySelector("[data-time-toggle]");
const observationStart = document.querySelector("[data-start-observation]");
const observationControls = document.querySelector("[data-observation-controls]");
const observationProgress = document.querySelector("[data-observation-progress]");
const observationPrevious = document.querySelector("[data-observation-previous]");
const observationPause = document.querySelector("[data-observation-pause]");
const observationNext = document.querySelector("[data-observation-next]");
const observationStatus = document.querySelector("[data-observation-status]");
const reelItems = mapItems.filter((item) => item.previewVideo);
const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
const compactMapViewport = window.matchMedia("(max-width: 680px)");
const reelMosaicQuery = new URLSearchParams(window.location.search);
const reelMosaicMode = reelMosaicQuery.get("reel");
const reelMosaicEnabled = reelMosaicMode !== "single";
const reelMosaicReviewActive = ["mosaic", "eleven-mosaic"]
  .includes(reelMosaicMode) || reelMosaicQuery.has("preview");
const reelMosaicInitialId = reelMosaicMode === "eleven-mosaic"
  ? "eleven"
  : reelMosaicQuery.get("preview") || "eleven";
const reelMosaicSlots = ["context", "detail"];
const reelMosaicVideos = [];
const mapButtons = new Map();
const mapLabels = new Map();
let selectedMapId = null;
let rovingMapId = "garage";
let previewHideTimer = 0;
let previewShowFrame = 0;
let activePreviewItem = null;
let atmosphereMapId = null;
let searchRelationshipId = null;
let timeModeActive = false;
const mapFilterKinds = ["company", "project", "personal", "practice"];
let activeMapFilters = new Set(mapFilterKinds);
let applyingUrlState = false;
let scheduleMapLinksRender = () => {};

const writeUrlState = (changes, { replace = false } = {}) => {
  if (applyingUrlState) {
    return;
  }

  const url = new URL(window.location.href);

  Object.entries(changes).forEach(([key, value]) => {
    if (key === "hash") {
      url.hash = value || "";
      return;
    }

    if (value === null || value === undefined || value === "" || value === false) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  });

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ ...window.history.state, ...changes }, "", nextUrl);
};

const compactTimeAngleOffsets = {
  optimal: -0.55,
  "garage-app": 0.45,
  narkomfin: 0.18,
};

const getTimeLayout = (item) => {
  if (!Number.isFinite(item.timeYear)) {
    return { x: item.x, y: item.y };
  }

  const centerX = 50;
  const centerY = 54;
  const getSourceAngle = (candidate) => Math.atan2(
    (candidate.y - centerY) / 34,
    (candidate.x - centerX) / 44,
  );
  const sourceAngle = getSourceAngle(item);
  const sameYearItems = mapItems
    .filter((candidate) => candidate.timeYear === item.timeYear)
    .sort((left, right) => getSourceAngle(left) - getSourceAngle(right));
  const sameYearIndex = sameYearItems.findIndex((candidate) => candidate.id === item.id);
  const centeredIndex = sameYearIndex - ((sameYearItems.length - 1) / 2);
  let radiusX;
  let radiusY;

  if (item.timeYear >= 2021) {
    const progress = (2026 - item.timeYear) / 5;
    radiusX = 14 + progress * 13;
    radiusY = 11 + progress * 9;
  } else if (item.timeYear >= 2015) {
    const progress = (2021 - item.timeYear) / 6;
    radiusX = 27 + progress * 12;
    radiusY = 20 + progress * 9;
  } else {
    const progress = Math.max(0, Math.min(1, (2015 - item.timeYear) / 6));
    radiusX = 39 + progress * 13;
    radiusY = 29 + progress * 9;
  }

  radiusX += centeredIndex * 0.8;
  radiusY += centeredIndex * 0.55;
  const angle = sourceAngle
    + centeredIndex * 0.32
    + (window.innerWidth <= 680 ? compactTimeAngleOffsets[item.id] || 0 : 0);

  return {
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY,
  };
};

const resolveMapLayout = (item) => {
  const viewportWidth = window.innerWidth;
  let x = item.x;
  let y = item.y;

  if (timeModeActive && Number.isFinite(item.timeYear)) {
    return getTimeLayout(item);
  }

  if (viewportWidth >= 821 && viewportWidth <= 1100) {
    const tabletOverrides = {
      ilmix: { x: 19 },
      "principle-system": { x: 18 },
      "principle-wings": { y: 43 },
    };
    const override = tabletOverrides[item.id];

    x = override?.x ?? x;
    y = override?.y ?? y;
  } else if (viewportWidth >= 681 && viewportWidth <= 820) {
    if (item.id === "ilmix") {
      y = 33;
    }
  } else if (viewportWidth <= 680) {
    if (item.id === "garage-site") {
      x = viewportWidth <= 360 ? 63 : 60;
    }
  }

  if (viewportWidth <= 360) {
    const compactOverrides = {
      "garage-archives": { x: 62, y: 29 },
      eleven: { x: 78, y: 71 },
      art: { x: 49, y: 83 },
      "principle-autonomy": { x: 23.5, y: 38 },
      "principle-system": { x: 15 },
      "principle-goal": { y: 46 },
      "principle-communicate": { x: 26, y: 53 },
      "principle-tools": { y: 59 },
      "principle-design-engineering": { x: 26 },
      "principle-experiment": { x: 18 },
      "principle-language": { x: 23 },
    };
    const override = compactOverrides[item.id];

    x = override?.x ?? x;
    y = override?.y ?? y;
  }

  if (viewportWidth <= 680) {
    const mobileYScale = Number.parseFloat(
      signalField?.style.getPropertyValue("--mobile-map-y-scale") || "1",
    );
    const safeMobileYScale = Number.isFinite(mobileYScale)
      ? Math.max(1, Math.min(1.16, mobileYScale))
      : 1;
    const mobileMapTop = Number.parseFloat(
      signalField?.style.getPropertyValue("--mobile-map-top") || "-18",
    );
    const mobileMapReserve = Number.parseFloat(
      signalField?.style.getPropertyValue("--mobile-map-reserve") || "126",
    );
    const cameraHeight = Math.max(
      1,
      (signalField?.clientHeight || window.innerHeight)
        - mobileMapReserve
        - mobileMapTop,
    );
    const glyphRadius = (Number.isFinite(item.size) ? item.size : 24) * 0.44;
    const safeTopY = (
      (glyphRadius + 8 - mobileMapTop) / cameraHeight
    ) * 100;

    y = Math.max(
      safeTopY,
      Math.min(94, 50 + (y - 50) * safeMobileYScale),
    );
  }

  return { x, y };
};

const applyMapLayout = () => {
  mapItems.forEach((item) => {
    const position = resolveMapLayout(item);
    const button = mapButtons.get(item.id);
    const label = mapLabels.get(item.id);

    button?.style.setProperty("--x", `${position.x}%`);
    button?.style.setProperty("--y", `${position.y}%`);
    label?.style.setProperty("--x", `${position.x}%`);
    label?.style.setProperty("--y", `${position.y}%`);
    label?.classList.toggle("is-time-undated", timeModeActive && !Number.isFinite(item.timeYear));

    if (item.id === atmosphereMapId && signalField) {
      signalField.style.setProperty("--focus-x", `${position.x}%`);
      signalField.style.setProperty("--focus-y", `${position.y}%`);
    }
  });
};

const syncMapRelationships = () => {
  if (!mapLinksRoot) {
    return;
  }

  const relationshipId = searchRelationshipId || atmosphereMapId;
  const paths = Array.from(mapLinksRoot.querySelectorAll("path"));
  let hasVisibleRelationship = false;

  paths.forEach((path) => {
    const parentId = path.dataset.parentId;
    const childId = path.dataset.childId;
    const parentKind = mapButtons.get(parentId)?.dataset.mapKind;
    const childKind = mapButtons.get(childId)?.dataset.mapKind;
    const isFilterVisible = activeMapFilters.has(parentKind)
      && activeMapFilters.has(childKind);
    const isActive = Boolean(
      relationshipId
      && (relationshipId === parentId || relationshipId === childId),
    );
    const isVisibleRelationship = isActive && isFilterVisible;

    path.classList.toggle("is-filter-hidden", !isFilterVisible);
    path.classList.toggle("is-active-relation", isVisibleRelationship);
    hasVisibleRelationship ||= isVisibleRelationship;
  });

  mapLinksRoot.classList.toggle("has-active-relation", hasVisibleRelationship);

  if (hasVisibleRelationship) {
    mapLinksRoot.dataset.relationshipId = relationshipId;
  } else {
    delete mapLinksRoot.dataset.relationshipId;
  }
};

const setSearchRelationshipPreview = (id = null) => {
  searchRelationshipId = id;
  syncMapRelationships();
};

const setMapAtmosphere = (item = null) => {
  if (!signalField) {
    return;
  }

  if (!item) {
    atmosphereMapId = null;
    delete signalField.dataset.focusId;
    delete signalField.dataset.focusKind;
    signalField.style.removeProperty("--focus-x");
    signalField.style.removeProperty("--focus-y");
    syncMapRelationships();
    return;
  }

  atmosphereMapId = item.id;
  const position = resolveMapLayout(item);
  signalField.dataset.focusId = item.id;
  signalField.dataset.focusKind = item.accentKind || item.kind;
  signalField.style.setProperty("--focus-x", `${position.x}%`);
  signalField.style.setProperty("--focus-y", `${position.y}%`);
  syncMapRelationships();
};

const restoreSelectedMapAtmosphere = () => {
  setMapAtmosphere(
    mapItems.find((item) => item.id === selectedMapId) || null,
  );
};

const syncMapMetaOverflow = () => {
  const track = mapMeta?.querySelector(".map-readout__meta-track");

  if (!mapMeta || !track) {
    return;
  }

  const travel = Math.max(0, track.scrollWidth - mapMeta.clientWidth + 8);
  const shouldMarquee = travel > 8;

  mapMeta.classList.toggle("is-marquee", shouldMarquee);
  mapMeta.style.setProperty("--map-meta-travel", `${-travel}px`);
  mapMeta.style.setProperty(
    "--map-meta-duration",
    `${Math.min(16, Math.max(10, 8 + travel / 48)).toFixed(2)}s`,
  );
};

const setMapMetaText = (value) => {
  if (!mapMeta) {
    return;
  }

  const text = typographUiText(value);
  const track = document.createElement("span");

  track.className = "map-readout__meta-track";
  track.textContent = text;
  mapMeta.classList.remove("is-marquee");
  mapMeta.removeAttribute("aria-label");
  mapMeta.replaceChildren(track);
  window.requestAnimationFrame(syncMapMetaOverflow);
};

const getNavigableMapItems = () => (
  mapItems.filter((item) => {
    const button = mapButtons.get(item.id);

    return button
      && (!timeModeActive || Number.isFinite(item.timeYear))
      && !button.classList.contains("is-search-miss")
      && activeMapFilters.has(item.kind);
  })
);

const syncMapNodeAvailability = () => {
  const hasCustomFilters = activeMapFilters.size < mapFilterKinds.length;

  mapItems.forEach((item) => {
    const button = mapButtons.get(item.id);

    if (!button) {
      return;
    }

    const isAvailable = (!timeModeActive || Number.isFinite(item.timeYear))
      && !button.classList.contains("is-search-miss")
      && activeMapFilters.has(item.kind);

    button.inert = !isAvailable;
    button.setAttribute("aria-hidden", String(!isAvailable));
    button.classList.toggle("is-filter-miss", !activeMapFilters.has(item.kind));
    button.classList.toggle(
      "is-filter-match",
      hasCustomFilters && activeMapFilters.has(item.kind),
    );
  });
};

const setMapRovingId = (id, { focus = false } = {}) => {
  const target = mapButtons.get(id);

  if (!target) {
    return;
  }

  rovingMapId = id;
  mapButtons.forEach((button, buttonId) => {
    button.tabIndex = buttonId === rovingMapId ? 0 : -1;
  });

  if (focus) {
    target.focus();
  }
};

const getDirectionalMapItem = (id, key) => {
  const current = mapItems.find((item) => item.id === id);
  const candidates = getNavigableMapItems();

  if (!current || !candidates.length) {
    return null;
  }

  if (key === "Home") {
    return candidates.find((item) => item.id === "garage") || candidates[0];
  }

  if (key === "End") {
    return candidates[candidates.length - 1];
  }

  const isHorizontal = key === "ArrowLeft" || key === "ArrowRight";
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const currentPosition = resolveMapLayout(current);

  return candidates
    .filter((item) => item.id !== id)
    .map((item) => {
      const position = resolveMapLayout(item);
      const dx = ((position.x - currentPosition.x) / 100) * window.innerWidth;
      const dy = ((position.y - currentPosition.y) / 100) * window.innerHeight;
      const primary = isHorizontal ? dx : dy;
      const cross = isHorizontal ? dy : dx;

      if (Math.sign(primary) !== direction || Math.abs(primary) < 1) {
        return null;
      }

      const distance = Math.hypot(dx, dy);
      const anglePenalty = Math.abs(cross) / Math.max(Math.abs(primary), 1);

      return {
        item,
        score: distance * (1 + anglePenalty * 1.6),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)[0]?.item || null;
};

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

  reelMosaicSlots.forEach((slot) => {
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
      video.play().catch(() => {
        // A segment can remain paused when autoplay is blocked.
      });
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

  const posterPath = item.previewPoster
    || item.previewVideo
      .split("?")[0]
      .replace("assets/reels/", "assets/reel-posters/")
      .replace(/\.mp4$/i, ".jpg");

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
    mapPreviewVideo.play().catch(() => {
      // The receiver can remain paused when autoplay is blocked.
    });
  }

  previewShowFrame = window.requestAnimationFrame(() => {
    previewShowFrame = 0;

    if (!mapInspector?.classList.contains("is-open")) {
      mapPreview.classList.add("is-visible");
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
    mapPreviewVideo.play().catch(() => {
      // The preview can remain paused when playback is blocked.
    });
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
    mapPreviewVideo.play().catch(() => {
      // The preview can remain paused when autoplay is blocked.
    });
    reelMosaicVideos.forEach((video) => {
      video.play().catch(() => {
        // A segment can remain paused when autoplay is blocked.
      });
    });
  }
});

const setMapEvidence = (evidence = null) => {
  const entries = [
    [mapEvidenceTask, evidence?.task],
    [mapEvidenceRole, evidence?.role],
    [mapEvidenceResult, evidence?.result],
  ];
  const hasEvidence = entries.some(([, value]) => Boolean(value));

  if (mapEvidence) {
    mapEvidence.hidden = !hasEvidence;
  }

  entries.forEach(([element, value]) => {
    if (!element) return;
    const row = element.closest("div");
    if (row) row.hidden = !value;
    element.textContent = value ? typographUiText(value) : "";
  });
};

const setInspectorOpen = (isOpen) => {
  if (!mapInspector) {
    return;
  }

  mapInspector.classList.toggle("is-open", isOpen);
  mapInspector.setAttribute("aria-hidden", String(!isOpen));
  mapInspector.inert = !isOpen;
  mapButtons.forEach((button, buttonId) => {
    button.setAttribute("aria-expanded", String(isOpen && buttonId === selectedMapId));
  });
};

const clearMapSelection = ({ updateHistory = false } = {}) => {
  const previousSelectedId = selectedMapId;
  selectedMapId = null;
  delete signalField.dataset.selectedKind;
  delete signalField.dataset.selectedId;
  setMapAtmosphere(null);

  if (mapInspector) {
    delete mapInspector.dataset.selectedMapId;
    delete mapInspector.dataset.mobilePlacement;
  }

  mapButtons.forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
  });
  setInspectorOpen(false);

  if (updateHistory && previousSelectedId) {
    writeUrlState({ point: null }, { replace: true });
  }
};

const selectMapItem = (
  id,
  {
    reveal = false,
    updateHistory = reveal,
    replaceHistory = false,
  } = {},
) => {
  const item = mapItems.find((candidate) => candidate.id === id);

  if (!item) {
    return;
  }

  selectedMapId = id;
  signalField.dataset.selectedKind = item.kind;
  signalField.dataset.selectedId = item.id;
  setMapAtmosphere(item);

  if (mapInspector) {
    const position = resolveMapLayout(item);
    mapInspector.dataset.selectedMapId = item.id;
    mapInspector.dataset.mobilePlacement = position.y >= 48 ? "top" : "bottom";
  }

  mapButtons.forEach((button, buttonId) => {
    const isSelected = buttonId === selectedMapId;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute(
      "aria-expanded",
      String(isSelected && mapInspector?.classList.contains("is-open")),
    );
  });
  setMapRovingId(id);

  if (mapKind) {
    mapKind.textContent = typographUiText(item.kindLabel);
  }

  if (mapTitle) {
    mapTitle.textContent = typographUiText(item.title);
  }

  if (mapMeta) {
    setMapMetaText(item.meta);
  }

  if (mapDescription) {
    mapDescription.textContent = typographUiText(item.description);
  }

  setMapEvidence(item.evidence);

  if (mapLink) {
    const itemHref = item.href || (item.kind === "practice" ? principlesSourceHref : "");

    if (itemHref) {
      mapLink.hidden = false;
      mapLink.href = itemHref;
      mapLink.textContent = item.kind === "practice" ? "ИСХОДНИК В\u00a0NOTION" : "ОТКРЫТЬ";
      mapLink.classList.remove("is-disabled");
      mapLink.removeAttribute("aria-disabled");
      mapLink.target = "_blank";
      mapLink.rel = "noreferrer";
    } else {
      mapLink.removeAttribute("href");
      mapLink.removeAttribute("target");
      mapLink.removeAttribute("rel");
      mapLink.textContent = "";
      mapLink.hidden = true;
      mapLink.classList.remove("is-disabled");
      mapLink.removeAttribute("aria-disabled");
    }
  }

  if (reveal) {
    setInspectorOpen(true);
  }

  if (updateHistory) {
    writeUrlState(
      {
        point: item.id,
        route: null,
        step: null,
      },
      { replace: replaceHistory },
    );
  }
};

inspectorClose?.addEventListener("click", () => {
  if (observationActive) {
    stopObservation();
    observationStart?.focus({ preventScroll: true });
    return;
  }

  const selectedButton = mapButtons.get(selectedMapId);
  clearMapSelection({ updateHistory: true });
  selectedButton?.focus();
});

if (mapNodesRoot) {
  mapItems.forEach((item) => {
    const button = document.createElement("button");
    const glyph = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.tabIndex = -1;
    button.className = `map-node map-node--${item.kind}`;
    button.dataset.mapId = item.id;
    button.dataset.mapKind = item.kind;
    button.dataset.mapAccent = item.accentKind || item.kind;
    button.dataset.mapParent = item.parent || "";
    if (Number.isFinite(item.timeYear)) {
      button.dataset.timeYear = String(item.timeYear);
      button.dataset.timeLabel = item.timeLabel || String(item.timeYear);
    }
    const position = resolveMapLayout(item);
    button.style.setProperty("--x", `${position.x}%`);
    button.style.setProperty("--y", `${position.y}%`);
    button.style.setProperty("--size", `${item.size}px`);
    const accessibleMapLabel = item.mapLabel || item.label;
    const glyphScale = item.id === "running"
      ? 0.72
      : item.kind === "personal"
        ? 0.48
        : 1;
    const glyphDiameter = Math.max(10, item.size * glyphScale);
    button.setAttribute("aria-label", typographUiText(`${accessibleMapLabel}. ${item.meta}`));
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "map-inspector");

    if (item.id === "garage") {
      button.classList.add("map-node--garage");
    }

    if (item.id === "running") {
      button.classList.add("map-node--running");
    }

    if (item.parent === "garage") {
      button.classList.add("map-node--garage-child");
    }

    if (item.x >= 72) {
      button.classList.add("map-node--label-west");
    }

    glyph.className = "map-node__glyph";
    glyph.setAttribute("aria-hidden", "true");
    label.className = `map-node-label map-node-label--${item.kind}`;
    label.dataset.mapLabelId = item.id;
    label.dataset.materialSurface = "map-node-label";
    label.dataset.materialActive = "always";
    if (Number.isFinite(item.timeYear)) {
      label.dataset.timeYear = String(item.timeYear);
      label.dataset.timeLabel = item.timeLabel || String(item.timeYear);
    }
    label.textContent = typographUiText(item.label);
    label.style.setProperty("--x", `${position.x}%`);
    label.style.setProperty("--y", `${position.y}%`);
    label.style.setProperty("--label-offset", `${glyphDiameter / 2 + 7}px`);
    label.style.setProperty("--garage-label-offset", `${glyphDiameter / 2 + 18}px`);

    if (item.id === "garage") {
      label.classList.add("map-node-label--garage");
    }

    if (item.id === "running") {
      label.classList.add("map-node-label--running");
    }

    if (item.id === "private-practice") {
      label.classList.add("map-node-label--private-practice");
    }

    if (item.x >= 72) {
      label.classList.add("map-node-label--west");
    }

    const showLabel = () => {
      mapLabels.forEach((candidate) => {
        candidate.classList.remove("is-visible");
      });

      if (!compactMapViewport.matches) {
        label.classList.add("is-visible");
      }
    };
    const hideLabel = () => label.classList.remove("is-visible");

    button.append(glyph);
    mapLabelsRoot?.append(label);
    button.addEventListener("pointerenter", () => {
      showLabel();
      setMapAtmosphere(item);
    });
    button.addEventListener("pointerleave", () => {
      if (document.activeElement === button) {
        return;
      }

      hideLabel();

      const focusedMapId = document.activeElement?.dataset?.mapId;
      if (!compactMapViewport.matches && focusedMapId) {
        mapLabels.get(focusedMapId)?.classList.add("is-visible");
      }

      restoreSelectedMapAtmosphere();
    });
    button.addEventListener("click", () => {
      hideLabel();
      hideMapPreview({ immediate: true });
      trackPortfolioEvent("point_open", {
        point_id: item.id,
        source: "map",
      });
      selectMapItem(item.id, { reveal: true });
    });
    button.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        button.click();
        return;
      }

      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
      }

      const nextItem = getDirectionalMapItem(item.id, event.key);

      if (!nextItem) {
        return;
      }

      event.preventDefault();
      setMapRovingId(nextItem.id, { focus: true });
    });
    button.addEventListener("focus", () => {
      showLabel();
      selectMapItem(item.id);
    });
    button.addEventListener("blur", hideLabel);

    if (item.previewVideo) {
      button.addEventListener("pointerenter", () => showMapPreview(item));
      button.addEventListener("pointerleave", () => hideMapPreview());
      button.addEventListener("focus", () => showMapPreview(item));
      button.addEventListener("blur", () => hideMapPreview());
    }

    mapButtons.set(item.id, button);
    mapLabels.set(item.id, label);
    mapNodesRoot.append(button);
  });

  applyMapLayout();

  compactMapViewport.addEventListener("change", (event) => {
    if (!event.matches) {
      return;
    }

    mapLabels.forEach((label) => label.classList.remove("is-visible"));
    hideMapPreview({ immediate: true });
  });
}

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

if (mapLinksRoot) {
  const itemById = new Map(mapItems.map((item) => [item.id, item]));
  const childrenByParent = new Map();

  mapItems.forEach((item) => {
    if (!item.parent || !itemById.has(item.parent)) {
      return;
    }

    const siblings = childrenByParent.get(item.parent) || [];
    siblings.push(item);
    childrenByParent.set(item.parent, siblings);
  });

  const renderMapLinks = () => {
    const bounds = mapLinksRoot.getBoundingClientRect();

    if (!bounds.width || !bounds.height) {
      return;
    }

    const linkElements = [];
    const getNodeGeometry = (item) => {
      const glyph = mapButtons.get(item.id)?.querySelector(".map-node__glyph");
      const rect = glyph?.getBoundingClientRect();

      if (!rect?.width || !rect?.height) {
        const position = resolveMapLayout(item);

        return {
          centerX: (position.x / 100) * bounds.width,
          centerY: (position.y / 100) * bounds.height,
          radius: item.size / 2,
        };
      }

      return {
        centerX: rect.left + rect.width / 2 - bounds.left,
        centerY: rect.top + rect.height / 2 - bounds.top,
        radius: Math.max(rect.width, rect.height) / 2,
      };
    };

    childrenByParent.forEach((children, parentId) => {
      const parent = itemById.get(parentId);
      const parentGeometry = getNodeGeometry(parent);
      const measuredChildren = children
        .map((item) => {
          const geometry = getNodeGeometry(item);
          const deltaX = geometry.centerX - parentGeometry.centerX;
          const deltaY = geometry.centerY - parentGeometry.centerY;

          return {
            item,
            geometry,
            angle: Math.atan2(deltaY, deltaX),
          };
        })
        .sort((left, right) => (
          left.angle - right.angle
          || left.geometry.centerY - right.geometry.centerY
          || left.geometry.centerX - right.geometry.centerX
        ));
      const firstAngle = measuredChildren[0]?.angle || 0;
      const lastAngle = measuredChildren.at(-1)?.angle || firstAngle;
      const portPadding = (parentId === "garage" ? 3 : 4) * (Math.PI / 180);
      const portStart = firstAngle - portPadding;
      const portEnd = lastAngle + portPadding;

      measuredChildren.forEach(({ item, geometry }, index) => {
        const portProgress = measuredChildren.length > 1
          ? index / (measuredChildren.length - 1)
          : 0.5;
        const portAngle = portStart + (portEnd - portStart) * portProgress;
        const parentRadius = parentGeometry.radius + 3;
        const childRadius = geometry.radius + 2;
        const path = document.createElementNS(svgNamespace, "path");
        const parentCenterX = parentGeometry.centerX;
        const parentCenterY = parentGeometry.centerY;
        const childCenterX = geometry.centerX;
        const childCenterY = geometry.centerY;
        const sourcePixelX = parentCenterX + Math.cos(portAngle) * parentRadius;
        const sourcePixelY = parentCenterY + Math.sin(portAngle) * parentRadius;
        const childToSourceX = sourcePixelX - childCenterX;
        const childToSourceY = sourcePixelY - childCenterY;
        const childToSourceLength = Math.hypot(childToSourceX, childToSourceY) || 1;
        const targetPixelX = childCenterX
          + (childToSourceX / childToSourceLength) * childRadius;
        const targetPixelY = childCenterY
          + (childToSourceY / childToSourceLength) * childRadius;
        const deltaX = targetPixelX - sourcePixelX;
        const deltaY = targetPixelY - sourcePixelY;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const targetDirectionX = deltaX / distance;
        const targetDirectionY = deltaY / distance;
        const sourceLead = Math.min(48, Math.max(18, distance * 0.24));
        const targetLead = Math.min(38, Math.max(14, distance * 0.2));
        const control1PixelX = sourcePixelX + Math.cos(portAngle) * sourceLead;
        const control1PixelY = sourcePixelY + Math.sin(portAngle) * sourceLead;
        const control2PixelX = targetPixelX - targetDirectionX * targetLead;
        const control2PixelY = targetPixelY - targetDirectionY * targetLead;
        const toViewBoxX = (value) => (value / bounds.width) * 100;
        const toViewBoxY = (value) => (value / bounds.height) * 100;
        const sourceX = toViewBoxX(sourcePixelX);
        const sourceY = toViewBoxY(sourcePixelY);
        const targetX = toViewBoxX(targetPixelX);
        const targetY = toViewBoxY(targetPixelY);
        const control1X = toViewBoxX(control1PixelX);
        const control1Y = toViewBoxY(control1PixelY);
        const control2X = toViewBoxX(control2PixelX);
        const control2Y = toViewBoxY(control2PixelY);

        path.setAttribute(
          "d",
          `M${sourceX.toFixed(3)} ${sourceY.toFixed(3)}`
            + `C${control1X.toFixed(3)} ${control1Y.toFixed(3)}`
            + ` ${control2X.toFixed(3)} ${control2Y.toFixed(3)}`
            + ` ${targetX.toFixed(3)} ${targetY.toFixed(3)}`,
        );

        if (parentId === "garage") {
          path.classList.add("is-garage-link");
        }

        if (parentId === "private-practice") {
          path.classList.add("is-private-practice-link");
        }

        path.dataset.parentId = parentId;
        path.dataset.childId = item.id;
        linkElements.push(path);
      });
    });

    mapLinksRoot.replaceChildren(...linkElements);
    syncMapRelationships();
  };

  let mapLinksResizeFrame = 0;
  let mapLinksSettleTimer = 0;
  scheduleMapLinksRender = () => {
    window.cancelAnimationFrame(mapLinksResizeFrame);
    window.clearTimeout(mapLinksSettleTimer);
    mapLinksResizeFrame = window.requestAnimationFrame(() => {
      applyMapLayout();
      renderMapLinks();
    });
    mapLinksSettleTimer = window.setTimeout(() => {
      applyMapLayout();
      renderMapLinks();
    }, 940);
  };

  renderMapLinks();
  mapLinksRoot.addEventListener("transitionend", (event) => {
    if (event.target === mapLinksRoot && event.propertyName === "transform") {
      renderMapLinks();
    }
  });
  window.addEventListener("resize", scheduleMapLinksRender, { passive: true });
}

const seededRandom = (seed) => {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

if (mapSpecksRoot) {
  const zones = [
    { kind: "company", count: 17, x: [10, 61], y: [8, 38], seed: 11 },
    { kind: "project", count: 22, x: [54, 94], y: [17, 82], seed: 23 },
    { kind: "personal", count: 15, x: [27, 72], y: [70, 94], seed: 37 },
    { kind: "practice", count: 18, x: [6, 40], y: [28, 80], seed: 47 },
  ];

  zones.forEach((zone) => {
    const random = seededRandom(zone.seed);

    for (let index = 0; index < zone.count; index += 1) {
      const speck = document.createElement("span");
      const x = zone.x[0] + random() * (zone.x[1] - zone.x[0]);
      const y = zone.y[0] + random() * (zone.y[1] - zone.y[0]);
      const size = 2 + random() * 3;
      const opacity = 0.18 + random() * 0.34;

      speck.className = `map-speck map-speck--${zone.kind}`;
      speck.style.setProperty("--x", `${x.toFixed(2)}%`);
      speck.style.setProperty("--y", `${y.toFixed(2)}%`);
      speck.style.setProperty("--s", `${size.toFixed(2)}px`);
      speck.style.setProperty("--o", opacity.toFixed(2));
      mapSpecksRoot.append(speck);
    }
  });

  let speckClearanceFrame = 0;

  const syncMapSpeckClearance = () => {
    const glyphs = Array.from(
      mapNodesRoot?.querySelectorAll(".map-node__glyph") || [],
    ).map((glyph) => {
      const bounds = glyph.getBoundingClientRect();

      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
        radius: Math.max(bounds.width, bounds.height) / 2,
      };
    });

    mapSpecksRoot.querySelectorAll(".map-speck").forEach((speck) => {
      const bounds = speck.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const radius = Math.max(bounds.width, bounds.height) / 2;
      const isNodeAdjacent = glyphs.some((glyph) => (
        Math.hypot(glyph.x - x, glyph.y - y)
        < glyph.radius + radius + 10
      ));

      speck.classList.toggle("is-node-adjacent", isNodeAdjacent);
    });
  };

  const scheduleMapSpeckClearance = () => {
    window.cancelAnimationFrame(speckClearanceFrame);
    speckClearanceFrame = window.requestAnimationFrame(syncMapSpeckClearance);
  };

  scheduleMapSpeckClearance();
  window.addEventListener("resize", scheduleMapSpeckClearance, {
    passive: true,
  });
  mapNodesRoot?.addEventListener("transitionend", (event) => {
    if (
      event.target instanceof Element
      && event.target.matches(".map-node, .map-node__glyph")
    ) {
      scheduleMapSpeckClearance();
    }
  });
}

setMapRovingId("garage");

if (mapMeta && "ResizeObserver" in window) {
  new ResizeObserver(syncMapMetaOverflow).observe(mapMeta);
}

const practiceMap = document.querySelector("[data-practice-map]");
const mapFilterButtons = Array.from(document.querySelectorAll("[data-map-filter]"));

const normalizeMapFilters = (filters) => {
  if (
    filters === "all"
    || filters === null
    || filters === undefined
    || filters === ""
  ) {
    return new Set(mapFilterKinds);
  }

  const values = filters instanceof Set
    ? [...filters]
    : Array.isArray(filters)
      ? filters
      : String(filters).split(",");
  const normalized = values.filter((kind) => mapFilterKinds.includes(kind));

  return new Set(normalized.length ? normalized : mapFilterKinds);
};

const allMapFiltersActive = () => (
  activeMapFilters.size === mapFilterKinds.length
  && mapFilterKinds.every((kind) => activeMapFilters.has(kind))
);

const serializeMapFilters = () => (
  allMapFiltersActive()
    ? null
    : mapFilterKinds.filter((kind) => activeMapFilters.has(kind)).join(",")
);

const setMapFilter = (
  filters,
  {
    updateHistory = true,
    replaceHistory = false,
  } = {},
) => {
  activeMapFilters = normalizeMapFilters(filters);
  const isAll = allMapFiltersActive();

  if (practiceMap) {
    practiceMap.dataset.activeKind = isAll ? "all" : "custom";
    practiceMap.dataset.activeKinds = mapFilterKinds
      .filter((kind) => activeMapFilters.has(kind))
      .join(",");
  }

  mapFilterButtons.forEach((button) => {
    const kind = button.dataset.mapFilter;
    const isActive = kind === "all"
      ? isAll
      : !isAll && activeMapFilters.has(kind);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  document.querySelectorAll(".map-speck").forEach((speck) => {
    const kind = mapFilterKinds.find((candidate) => (
      speck.classList.contains(`map-speck--${candidate}`)
    ));

    speck.classList.toggle(
      "is-filter-miss",
      Boolean(kind && !activeMapFilters.has(kind)),
    );
    speck.classList.toggle(
      "is-filter-match",
      Boolean(kind && !isAll && activeMapFilters.has(kind)),
    );
  });

  syncMapNodeAvailability();
  syncMapRelationships();
  const navigableItems = getNavigableMapItems();
  const selectedItemIsAvailable = navigableItems.some(
    (item) => item.id === selectedMapId,
  );
  let clearedSelectedPoint = false;

  if (selectedMapId && !selectedItemIsAvailable) {
    clearMapSelection();
    clearedSelectedPoint = true;
  }

  if (!navigableItems.some((item) => item.id === rovingMapId) && navigableItems[0]) {
    setMapRovingId(navigableItems[0].id);
  }

  if (updateHistory) {
    const changes = {
      filter: serializeMapFilters(),
    };

    if (clearedSelectedPoint) {
      changes.point = null;
    }

    writeUrlState(
      changes,
      { replace: replaceHistory },
    );
  }
};

const toggleMapFilter = (kind) => {
  if (kind === "all") {
    setMapFilter("all");
    return;
  }

  if (!mapFilterKinds.includes(kind)) {
    return;
  }

  const nextFilters = allMapFiltersActive()
    ? new Set([kind])
    : new Set(activeMapFilters);

  if (!allMapFiltersActive()) {
    if (nextFilters.has(kind)) {
      nextFilters.delete(kind);
    } else {
      nextFilters.add(kind);
    }
  }

  setMapFilter(nextFilters.size ? nextFilters : "all");
};

mapFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleMapFilter(button.dataset.mapFilter || "all");
    trackPortfolioEvent("map_filter_change", {
      filters: serializeMapFilters() || "all",
    });
  });
});

const setTimeMode = (
  enabled,
  {
    updateHistory = true,
    replaceHistory = false,
  } = {},
) => {
  const nextEnabled = Boolean(enabled);

  if (nextEnabled === timeModeActive) {
    if (updateHistory) {
      writeUrlState(
        { view: nextEnabled ? "time" : null },
        { replace: replaceHistory },
      );
    }
    return;
  }

  hideMapPreview({ immediate: true });
  clearMapSelection();

  timeModeActive = nextEnabled;
  signalField?.toggleAttribute("data-time-view", nextEnabled);

  if (signalField) {
    if (nextEnabled) {
      signalField.dataset.observationMode = "time";
    } else {
      delete signalField.dataset.observationMode;
    }
  }

  timeToggle?.setAttribute("aria-pressed", String(nextEnabled));
  if (timeToggle) {
    timeToggle.classList.toggle("is-active", nextEnabled);
    timeToggle.setAttribute(
      "aria-label",
      nextEnabled ? "Вернуть смысловую карту" : "Показывать хронологию",
    );
  }

  if (mapNote) {
    mapNote.textContent = nextEnabled
      ? "КОЛЬЦА — ГОДЫ: БЛИЖЕ К ЦЕНТРУ — НОВЕЕ."
      : "КООРДИНАТЫ СУБЪЕКТИВНЫ: ПОЛОЖЕНИЕ — СМЫСЛОВАЯ БЛИЗОСТЬ, РАЗМЕР — ЛИЧНЫЙ ВЕС ОПЫТА.";
  }

  applyMapLayout();
  syncMapNodeAvailability();
  scheduleMapLinksRender();

  if (updateHistory) {
    writeUrlState(
      {
        view: nextEnabled ? "time" : null,
        filter: serializeMapFilters(),
      },
      { replace: replaceHistory },
    );
  }
};

timeToggle?.addEventListener("click", () => {
  setTimeMode(!timeModeActive);
  trackPortfolioEvent("chronology_toggle", {
    state: timeModeActive ? "enabled" : "disabled",
  });
});

const observationSteps = [
  {
    id: "origin",
    kind: "МАРШРУТ / 01",
    title: "СЕАНС НАБЛЮДЕНИЯ",
    meta: "ОКОЛО 60 СЕКУНД / 8 КООРДИНАТ",
    description: "Короткий маршрут по карте: от моей профессиональной оптики к институциональной работе, частной практике и принципам.",
    x: 50,
    y: 54,
  },
  { id: "garage", itemId: "garage" },
  { id: "narkomfin", itemId: "narkomfin" },
  { id: "private-practice", itemId: "private-practice" },
  { id: "tarski", itemId: "tarski" },
  { id: "shirokostup", itemId: "shirokostup" },
  { id: "principle", itemId: "principle-design-engineering" },
  {
    id: "contact",
    kind: "ФИНАЛ / 08",
    title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
    description: "Если вам нужен человек, который соединяет исследование, продукт, дизайн, координацию и реализацию — напишите мне.",
    href: "mailto:anton@gorokhovatsky.tech",
    x: 50,
    y: 54,
  },
];
const observationStepDuration = 7500;
let observationActive = false;
let observationPaused = false;
let observationStepIndex = 0;
let observationTimer = 0;

const clearObservationTimer = () => {
  window.clearTimeout(observationTimer);
  observationTimer = 0;
};

const setObservationCamera = (step) => {
  const item = step.itemId
    ? mapItems.find((candidate) => candidate.id === step.itemId)
    : null;
  const position = item ? resolveMapLayout(item) : { x: step.x, y: step.y };
  const cameraX = Math.max(-5.2, Math.min(5.2, (50 - position.x) * 0.12));
  const cameraY = Math.max(-3.6, Math.min(3.6, (54 - position.y) * 0.09));

  signalField?.style.setProperty("--observation-camera-x", `${cameraX}%`);
  signalField?.style.setProperty("--observation-camera-y", `${cameraY}%`);
};

const renderObservationSyntheticStep = (step) => {
  selectedMapId = null;
  setMapAtmosphere(null);
  mapButtons.forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
  });

  if (mapInspector) {
    mapInspector.dataset.selectedMapId = `observation-${step.id}`;
    mapInspector.dataset.mobilePlacement = step.id === "contact" ? "top" : "bottom";
  }

  if (mapKind) {
    mapKind.textContent = step.kind;
  }

  if (mapTitle) {
    mapTitle.textContent = typographUiText(step.title);
  }

  setMapMetaText(step.meta);

  if (mapDescription) {
    mapDescription.textContent = typographUiText(step.description);
  }

  setMapEvidence(null);

  if (mapLink) {
    if (step.href) {
      mapLink.hidden = false;
      mapLink.href = step.href;
      mapLink.textContent = "НАПИСАТЬ";
      mapLink.removeAttribute("target");
      mapLink.removeAttribute("rel");
    } else {
      mapLink.hidden = true;
      mapLink.removeAttribute("href");
      mapLink.textContent = "";
    }
  }

  setInspectorOpen(true);
};

const updateObservationControls = () => {
  if (observationProgress) {
    observationProgress.textContent = `${String(observationStepIndex + 1).padStart(2, "0")} / ${String(observationSteps.length).padStart(2, "0")}`;
  }

  if (observationPrevious) {
    observationPrevious.disabled = observationStepIndex === 0;
  }

  if (observationPause) {
    observationPause.textContent = observationPaused ? "ПРОДОЛЖИТЬ" : "ПАУЗА";
    observationPause.setAttribute("aria-pressed", String(observationPaused));
  }

  if (observationNext) {
    observationNext.textContent = observationStepIndex === observationSteps.length - 1
      ? "ЗАВЕРШИТЬ"
      : "ДАЛЬШЕ";
  }

  signalField?.style.setProperty(
    "--observation-route-progress",
    String((observationStepIndex + 1) / observationSteps.length),
  );
};

const scheduleObservationStep = () => {
  clearObservationTimer();

  if (!observationActive || observationPaused) {
    return;
  }

  if (observationStepIndex >= observationSteps.length - 1) {
    observationPaused = true;
    updateObservationControls();
    return;
  }

  observationTimer = window.setTimeout(() => {
    observationStepIndex += 1;
    renderObservationStep(observationStepIndex, { updateHistory: true });
  }, observationStepDuration);
};

function renderObservationStep(index, { updateHistory = true } = {}) {
  if (!observationActive) {
    return;
  }

  observationStepIndex = Math.max(
    0,
    Math.min(observationSteps.length - 1, Number(index) || 0),
  );
  const step = observationSteps[observationStepIndex];

  setObservationCamera(step);

  if (step.itemId) {
    selectMapItem(step.itemId, {
      reveal: true,
      updateHistory: false,
    });
  } else {
    renderObservationSyntheticStep(step);
  }

  updateObservationControls();

  if (observationStatus) {
    observationStatus.textContent = `Сеанс наблюдения: шаг ${observationStepIndex + 1} из ${observationSteps.length}. ${step.title || mapItems.find((item) => item.id === step.itemId)?.title || ""}`;
  }

  if (updateHistory) {
    writeUrlState(
      {
        point: null,
        route: "observation",
        step: observationStepIndex + 1,
        view: null,
      },
      { replace: true },
    );
  }

  scheduleObservationStep();
}

const stopObservation = (
  {
    updateHistory = true,
    closeInspector = true,
  } = {},
) => {
  clearObservationTimer();
  observationActive = false;
  observationPaused = false;
  observationControls?.setAttribute("hidden", "");
  delete signalField?.dataset.observationActive;
  signalField?.style.removeProperty("--observation-camera-x");
  signalField?.style.removeProperty("--observation-camera-y");
  signalField?.style.removeProperty("--observation-route-progress");

  if (closeInspector) {
    clearMapSelection();
  }

  if (updateHistory) {
    writeUrlState(
      {
        route: null,
        step: null,
        point: closeInspector ? null : selectedMapId,
      },
      { replace: true },
    );
  }
};

const startObservation = (
  {
    step = 0,
    autoplay = true,
    updateHistory = true,
    source = "direct",
  } = {},
) => {
  if (timeModeActive) {
    setTimeMode(false, {
      updateHistory: false,
      restoreFilter: false,
    });
  }

  setMapFilter("all", { updateHistory: false });
  hideMapPreview({ immediate: true });
  observationActive = true;
  observationPaused = !autoplay || reducedMotion.matches;
  signalField?.setAttribute("data-observation-active", "");

  if (observationControls) {
    observationControls.hidden = false;
  }

  if (updateHistory) {
    trackPortfolioEvent("observation_start", { source });
    writeUrlState(
      {
        route: "observation",
        step: Number(step) + 1,
        point: null,
        view: null,
        filter: null,
      },
    );
  }

  renderObservationStep(step, { updateHistory: true });
};

observationStart?.addEventListener("click", () => {
  startObservation();
});

observationPrevious?.addEventListener("click", () => {
  observationPaused = true;
  renderObservationStep(observationStepIndex - 1);
});

observationPause?.addEventListener("click", () => {
  observationPaused = !observationPaused;
  updateObservationControls();
  scheduleObservationStep();
});

observationNext?.addEventListener("click", () => {
  if (observationStepIndex >= observationSteps.length - 1) {
    trackPortfolioEvent("observation_complete", { source: "route" });
    stopObservation();
    return;
  }

  renderObservationStep(observationStepIndex + 1);
});

reducedMotion.addEventListener?.("change", () => {
  if (!reducedMotion.matches || !observationActive || observationPaused) {
    return;
  }

  observationPaused = true;
  clearObservationTimer();
  updateObservationControls();
});

document.addEventListener("keydown", (event) => {
  if (
    !observationActive
    || event.defaultPrevented
    || event.target instanceof HTMLInputElement
    || event.target instanceof HTMLTextAreaElement
    || event.target instanceof HTMLSelectElement
    || event.target?.isContentEditable
  ) {
    return;
  }

  if (event.key === "ArrowLeft" && observationStepIndex > 0) {
    event.preventDefault();
    observationPaused = true;
    renderObservationStep(observationStepIndex - 1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();

    if (observationStepIndex >= observationSteps.length - 1) {
      stopObservation();
    } else {
      renderObservationStep(observationStepIndex + 1);
    }
  }
});

const pauseMapPreviewPlayback = () => {
  mapPreviewVideo?.pause();
  pauseReelMosaic();
};

const requestMapLinksRender = () => {
  scheduleMapLinksRender();
};

const setApplyingUrlState = (isApplying) => {
  applyingUrlState = Boolean(isApplying);
};

export {
  activePreviewItem,
  clearMapSelection,
  getNavigableMapItems,
  hideMapPreview,
  inspectorClose,
  mapButtons,
  mapInspector,
  mapPreview,
  normalizeMapFilters,
  observationActive,
  observationSteps,
  pauseMapPreviewPlayback,
  requestMapLinksRender,
  rovingMapId,
  selectedMapId,
  selectMapItem,
  setApplyingUrlState,
  setInspectorOpen,
  setMapFilter,
  setMapRovingId,
  setSearchRelationshipPreview,
  setTimeMode,
  startObservation,
  stopObservation,
  syncMapNodeAvailability,
  timeModeActive,
  writeUrlState,
};
