// Runtime module 6/9: spatial map geometry, relations, filters, and previews.
import { trackPortfolioEvent } from "./analytics.js";
import {
  mapItems,
  principlesSourceHref,
  reelChapterSources,
} from "./map-data.js";
import { createObservationRoute } from "./observation-route.js";
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
const observationShowcase = document.querySelector("[data-observation-showcase]");
const observationShowcaseProgress = {
  "garage-site": 0,
  narkomfin: 1,
  "private-practice": 2,
  eleven: 2,
  shirokostup: 3,
};
const mapKind = document.querySelector("[data-map-kind]");
const mapTitle = document.querySelector("[data-map-title]");
const mapMeta = document.querySelector("[data-map-meta]");
const mapDescription = document.querySelector("[data-map-description]");
const mapLink = document.querySelector("[data-map-link]");
const mapInspector = document.querySelector("[data-map-inspector]");
const mapRelated = document.querySelector("[data-map-related]");
const mapRelatedTrack = document.querySelector("[data-map-related-track]");
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
const mapEvidenceById = JSON.parse(
  document.querySelector("#map-evidence-data")?.textContent || "{}",
);
const mapNote = document.querySelector("[data-map-note]");
const timeToggles = Array.from(document.querySelectorAll("[data-time-toggle]"));
const observationStart = document.querySelector("[data-start-observation]");
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
const mapLinkGeometries = new WeakMap();
const mapLinkAnimations = new WeakMap();

const syncMapNote = () => {
  if (!mapNote) {
    return;
  }

  if (!timeModeActive) {
    mapNote.textContent = "КООРДИНАТЫ СУБЪЕКТИВНЫ: ПОЛОЖЕНИЕ — СМЫСЛОВАЯ БЛИЗОСТЬ, РАЗМЕР — ЛИЧНЫЙ ВЕС ОПЫТА.";
    return;
  }

  mapNote.textContent = atmosphereMapId === "private-practice"
    ? "ЧАСТНАЯ ПРАКТИКА — 2020—СЕЙЧАС. ДЕВЯТЬ ПРОЕКТОВ ПОКАЗАНЫ ПО\u00a0ГОДАМ ЗАПУСКА."
    : "КОЛЬЦА — ГОДЫ: БЛИЖЕ К\u00a0ЦЕНТРУ — НОВЕЕ.";
};

const parseMapLinkCurve = (value) => {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];

  return numbers.length === 8 && numbers.every(Number.isFinite)
    ? numbers
    : null;
};

const formatMapLinkCurve = (values) => (
  `M${values[0].toFixed(3)} ${values[1].toFixed(3)}`
  + `C${values[2].toFixed(3)} ${values[3].toFixed(3)}`
  + ` ${values[4].toFixed(3)} ${values[5].toFixed(3)}`
  + ` ${values[6].toFixed(3)} ${values[7].toFixed(3)}`
);

const setMapLinkReactiveState = (path, isReactive) => {
  const geometry = mapLinkGeometries.get(path);
  const shouldMorph = isReactive && !reducedMotion.matches;

  if (!geometry || geometry.isReactive === shouldMorph) {
    return;
  }

  const targetD = shouldMorph ? geometry.reactiveD : geometry.baseD;
  const previousAnimation = mapLinkAnimations.get(path);

  window.cancelAnimationFrame(previousAnimation?.frame || 0);
  mapLinkAnimations.delete(path);
  geometry.isReactive = shouldMorph;

  if (reducedMotion.matches) {
    path.setAttribute("d", geometry.baseD);
    geometry.currentD = geometry.baseD;
    delete path.dataset.relationMorphing;
    return;
  }

  if (!path.isConnected) {
    path.setAttribute("d", targetD);
    geometry.currentD = targetD;
    delete path.dataset.relationMorphing;
    return;
  }

  const fromValues = parseMapLinkCurve(path.getAttribute("d") || geometry.currentD);
  const targetValues = parseMapLinkCurve(targetD);

  if (!fromValues || !targetValues) {
    path.setAttribute("d", targetD);
    geometry.currentD = targetD;
    delete path.dataset.relationMorphing;
    return;
  }

  const animation = { frame: 0 };
  const startedAt = window.performance.now();
  const duration = shouldMorph ? 440 : 320;

  // Keep the existing SVG path alive throughout the transition. Replacing it or
  // delegating `d` to SMIL can expose an empty intermediate frame in WebKit.
  path.dataset.relationMorphing = "true";
  const renderFrame = (timestamp) => {
    if (!path.isConnected) {
      delete path.dataset.relationMorphing;
      mapLinkAnimations.delete(path);
      return;
    }

    const progress = Math.min(1, (timestamp - startedAt) / duration);
    const easedProgress = 1 - ((1 - progress) ** 3);
    const currentValues = fromValues.map((value, index) => (
      value + (targetValues[index] - value) * easedProgress
    ));
    const currentD = formatMapLinkCurve(currentValues);

    path.setAttribute("d", currentD);
    geometry.currentD = currentD;

    if (progress < 1) {
      animation.frame = window.requestAnimationFrame(renderFrame);
      return;
    }

    path.setAttribute("d", targetD);
    geometry.currentD = targetD;
    delete path.dataset.relationMorphing;
    mapLinkAnimations.delete(path);
  };

  mapLinkAnimations.set(path, animation);
  animation.frame = window.requestAnimationFrame(renderFrame);
};

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

const timeGroupSectors = {
  garage: {
    parent: -2.28,
    compactParent: -2.28,
    children: [-3.08, -2.72, -1.82, -1.48],
    compactChildren: [-2.95, -2.58, -1.9, -1.45],
    order: ["garage-site", "collection", "narkomfin", "garage-app"],
  },
  "private-practice": {
    parent: -0.32,
    compactParent: -0.55,
    children: [0.02, 0.3, 0.58, 0.86, 1.14, 1.42, 1.7, 1.98, 2.26],
    compactChildren: [-0.08, 0.25, 0.58, 0.91, 1.24, 1.57, 1.9, 2.23, 2.56],
    order: [
      "shirokostup",
      "dusty",
      "tarski",
      "ks-fish",
      "herman",
      "dd-camp",
      "hotline-camp",
      "doronin",
      "eleven",
    ],
  },
};

const timeRootAngles = {
  optimal: [-2.98, -3],
  "early-career": [-2.3, -2.08],
  ilmix: [-2.54, -1.95],
};

const getTimeSectorAngle = (item, compact) => {
  const groupId = item.parent && timeGroupSectors[item.parent]
    ? item.parent
    : timeGroupSectors[item.id]
      ? item.id
      : null;

  if (!groupId) {
    return null;
  }

  const sector = timeGroupSectors[groupId];

  if (item.id === groupId) {
    return compact ? sector.compactParent : sector.parent;
  }

  const index = sector.order.indexOf(item.id);
  const angles = compact ? sector.compactChildren : sector.children;

  return angles[index] ?? sector.parent;
};

const getTimeLayout = (item) => {
  if (!Number.isFinite(item.timeYear)) {
    return { x: item.x, y: item.y };
  }

  const centerX = 50;
  const centerY = 54;
  const getSourceAngle = ({ x, y }) => Math.atan2((y - centerY) / 34, (x - centerX) / 44);
  const sourceAngle = getSourceAngle(item);
  const peers = mapItems
    .filter((candidate) => candidate.timeYear === item.timeYear)
    .sort((left, right) => getSourceAngle(left) - getSourceAngle(right));
  const lane = peers.findIndex(({ id }) => id === item.id) - (peers.length - 1) / 2;
  const year = item.timeYear;
  const radiusX = year >= 2021
    ? 22 + (2026 - year) * 2.4
    : year >= 2015
      ? 34 + (2021 - year) * 1.83
      : 45 + Math.max(0, Math.min(1, (2015 - year) / 5)) * 11;
  const radiusY = year >= 2021
    ? 17 + (2026 - year) * 1.6
    : year >= 2015
      ? 25 + (2021 - year) * 1.33
      : 33 + Math.max(0, Math.min(1, (2015 - year) / 5)) * 8;
  const compact = window.innerWidth <= 680;
  const compactRadiusXScale = compact ? 1.35 : 1;
  const groupAngle = getTimeSectorAngle(item, compact);
  const rootAngles = timeRootAngles[item.id];
  const angle = groupAngle
    ?? rootAngles?.[compact ? 1 : 0]
    ?? sourceAngle + lane * 0.18;

  return {
    x: centerX + Math.cos(angle) * radiusX * compactRadiusXScale,
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
    const parentButton = mapButtons.get(parentId);
    const childButton = mapButtons.get(childId);
    const parentKind = parentButton?.dataset.mapKind;
    const childKind = childButton?.dataset.mapKind;
    const isFilterVisible = activeMapFilters.has(parentKind)
      && activeMapFilters.has(childKind);
    const isTimeVisible = !timeModeActive || (
      parentButton?.hasAttribute("data-time-year")
      && childButton?.hasAttribute("data-time-year")
    );
    const isActive = Boolean(
      relationshipId
      && (relationshipId === parentId || relationshipId === childId),
    );
    const isVisibleRelationship = isActive && isFilterVisible && isTimeVisible;

    path.classList.toggle("is-filter-hidden", !isFilterVisible);
    path.toggleAttribute("hidden", !isTimeVisible);
    path.style.display = isTimeVisible ? "" : "none";
    path.classList.toggle("is-active-relation", isVisibleRelationship);
    setMapLinkReactiveState(path, isVisibleRelationship);
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
    delete signalField.dataset.focusPlane;
    signalField.style.removeProperty("--focus-x");
    signalField.style.removeProperty("--focus-y");
    signalField.style.removeProperty("--focus-horizon-x");
    syncMapRelationships();
    syncMapNote();
    return;
  }

  atmosphereMapId = item.id;
  const position = resolveMapLayout(item);
  signalField.dataset.focusId = item.id;
  signalField.dataset.focusKind = item.accentKind || item.kind;
  signalField.style.setProperty("--focus-x", `${position.x}%`);
  signalField.style.setProperty("--focus-y", `${position.y}%`);

  if (position.y >= 74) {
    const horizonX = ((position.x + 12) / 124) * 100;
    signalField.dataset.focusPlane = "ground";
    signalField.style.setProperty("--focus-horizon-x", `${horizonX}%`);
  } else {
    delete signalField.dataset.focusPlane;
    signalField.style.removeProperty("--focus-horizon-x");
  }
  syncMapRelationships();
  syncMapNote();
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

const renderObservationShowcase = ({ itemId, showcaseId } = {}) => {
  const activeId = showcaseId || itemId;
  const progress = observationShowcaseProgress[activeId];
  const isVisible = Number.isFinite(progress);

  observationShowcase?.classList.toggle("is-visible", isVisible);

  if (observationShowcase) {
    observationShowcase.dataset.activeId = isVisible ? activeId : "";
  }

  if (!isVisible) {
    return;
  }

  observationShowcase.querySelectorAll("[data-observation-showcase-id]")
    .forEach((plane, index) => {
      const delta = index - progress;
      const distance = Math.abs(delta);
      const isActive = plane.dataset.observationShowcaseId === activeId;
      const isIntroPlane = isActive && activeId === "garage-site";
      const properties = {
        x: isIntroPlane ? "-2vw" : `${delta * 14}vw`,
        y: `${(delta < 0 ? 1 : -1) * Math.min(28, distance * 17)}vh`,
        scale: isIntroPlane ? 0.85 : Math.max(0.48, 1 - distance * 0.28),
        opacity: isActive ? 1 : Math.max(0.16, 0.46 - distance * 0.1),
        blur: `${isActive ? 0 : Math.min(4, distance * 1.8)}px`,
        saturation: isActive ? 1 : 0.72,
        rotation: `${delta * -0.8}deg`,
        z: isActive ? 9 : Math.max(1, 3 - Math.round(distance)),
      };

      Object.entries(properties).forEach(([name, value]) => {
        plane.style.setProperty(`--showcase-${name}`, value);
      });
    });
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

const renderMapRelatedItems=(item=null)=>{
  const peers=mapItems.filter((candidate)=>candidate.kind==="project"&&candidate.parent===item?.parent&&candidate!==item);
  const start=peers.indexOf(item)+1;
  const ids=item?.id==="hotline-camp"?["eleven","dd-camp","dusty"]:null;
  const items=signalField?.hasAttribute("data-observation-active")?[]:(ids?ids.map((id)=>mapItems.find((candidate)=>candidate.id===id)):[...peers.slice(start),...peers.slice(0,start)]).slice(0,3);
  mapRelated.hidden=!items.length;
  mapRelatedTrack.innerHTML=items.map(({id,label,timeLabel,timeYear})=>`<a class="map-related__item" href="?point=${id}" role="listitem"><strong>${label}</strong><span>ПРОЕКТ${timeLabel||timeYear?` / ${timeLabel||timeYear}`:""}</span></a>`).join("");
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
  renderMapRelatedItems();

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
    mapTitle.textContent = item.displayTitle || typographUiText(item.title);
    mapTitle.setAttribute("aria-label", typographUiText(item.title));
  }

  if (mapMeta) {
    setMapMetaText(item.meta);
  }

  if (mapDescription) {
    mapDescription.textContent = typographUiText(item.description);
  }

  setMapEvidence(mapEvidenceById[item.id]);

  if (mapLink) {
    const itemHref = item.href || (item.kind === "practice" ? principlesSourceHref : "");

    if (itemHref) {
      mapLink.hidden = false;
      mapLink.href = itemHref;
      mapLink.textContent = item.linkLabel
        || (item.kind === "practice" ? "ИСХОДНИК В\u00a0NOTION" : "ОТКРЫТЬ");
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

  renderMapRelatedItems(item);

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
  if (observationRoute.active) {
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
          let angle = Math.atan2(deltaY, deltaX);

          if (timeModeActive && parentId === "private-practice" && angle < 0) {
            angle += Math.PI * 2;
          }

          return {
            item,
            geometry,
            angle,
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
        const relationKey = `${parentId}:${item.id}`;
        const path = mapLinksRoot.querySelector(
          `path[data-relation-key="${relationKey}"]`,
        ) || document.createElementNS(svgNamespace, "path");
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
        const normalPixelX = -deltaY / distance;
        const normalPixelY = deltaX / distance;
        const relationSpread = measuredChildren.length > 1
          ? (index / (measuredChildren.length - 1)) * 2 - 1
          : 0;
        const relationDirection = Math.abs(relationSpread) > 0.08
          ? Math.sign(relationSpread)
          : 1;
        const relationTension = Math.min(
          30,
          Math.max(14, distance * (0.09 + Math.abs(relationSpread) * 0.025)),
        );
        const reactiveControl1X = toViewBoxX(
          control1PixelX + normalPixelX * relationTension * relationDirection,
        );
        const reactiveControl1Y = toViewBoxY(
          control1PixelY + normalPixelY * relationTension * relationDirection,
        );
        const reactiveControl2X = toViewBoxX(
          control2PixelX - normalPixelX * relationTension * relationDirection,
        );
        const reactiveControl2Y = toViewBoxY(
          control2PixelY - normalPixelY * relationTension * relationDirection,
        );
        const baseD = `M${sourceX.toFixed(3)} ${sourceY.toFixed(3)}`
          + `C${control1X.toFixed(3)} ${control1Y.toFixed(3)}`
          + ` ${control2X.toFixed(3)} ${control2Y.toFixed(3)}`
          + ` ${targetX.toFixed(3)} ${targetY.toFixed(3)}`;
        const reactiveD = `M${sourceX.toFixed(3)} ${sourceY.toFixed(3)}`
          + `C${reactiveControl1X.toFixed(3)} ${reactiveControl1Y.toFixed(3)}`
          + ` ${reactiveControl2X.toFixed(3)} ${reactiveControl2Y.toFixed(3)}`
          + ` ${targetX.toFixed(3)} ${targetY.toFixed(3)}`;

        const existingGeometry = mapLinkGeometries.get(path);
        const preserveReactiveShape = Boolean(existingGeometry?.isReactive);
        const nextD = preserveReactiveShape ? reactiveD : baseD;

        window.cancelAnimationFrame(mapLinkAnimations.get(path)?.frame || 0);
        mapLinkAnimations.delete(path);
        delete path.dataset.relationMorphing;
        path.setAttribute("d", nextD);
        mapLinkGeometries.set(path, {
          baseD,
          reactiveD,
          currentD: nextD,
          isReactive: preserveReactiveShape,
        });

        if (parentId === "garage") {
          path.classList.add("is-garage-link");
        }

        if (parentId === "private-practice") {
          path.classList.add("is-private-practice-link");
        }

        path.dataset.parentId = parentId;
        path.dataset.childId = item.id;
        path.dataset.relationKey = relationKey;
        linkElements.push(path);
      });
    });

    linkElements.forEach((path) => {
      if (!path.isConnected) {
        mapLinksRoot.append(path);
      }
    });
    Array.from(mapLinksRoot.querySelectorAll("path")).forEach((path) => {
      if (!linkElements.includes(path)) {
        path.remove();
      }
    });
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
  reducedMotion.addEventListener?.("change", () => syncMapRelationships());
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
    const isReset = kind === "all";
    const isActive = isReset ? isAll : activeMapFilters.has(kind);
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

  const nextFilters = new Set(allMapFiltersActive() ? [] : activeMapFilters);

  if (nextFilters.has(kind)) {
    if (nextFilters.size === 1) {
      return;
    }

    nextFilters.delete(kind);
  } else {
    nextFilters.add(kind);
  }

  setMapFilter(nextFilters);
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

  timeToggles.forEach((toggle) => {
    toggle.setAttribute("aria-pressed", String(nextEnabled));
    toggle.classList.toggle("is-active", nextEnabled);
    toggle.setAttribute(
      "aria-label",
      nextEnabled ? "Вернуть смысловую карту" : "Показывать хронологию",
    );
  });

  syncMapNote();

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

timeToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    setTimeMode(!timeModeActive);
    trackPortfolioEvent("chronology_toggle", {
      state: timeModeActive ? "enabled" : "disabled",
    });
  });
});

const renderObservationSyntheticStep = (step) => {
  selectedMapId = null;
  setMapAtmosphere(null);
  mapButtons.forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
  });

  if (mapInspector) {
    mapInspector.dataset.selectedMapId = "observation-" + step.id;
    mapInspector.dataset.mobilePlacement = step.id === "contact" ? "top" : "bottom";
  }

  if (mapKind) {
    mapKind.textContent = step.kind;
  }

  if (mapTitle) {
    mapTitle.textContent = typographUiText(step.title);
    mapTitle.setAttribute("aria-label", typographUiText(step.title));
  }

  setMapMetaText(step.meta);

  if (mapDescription) {
    mapDescription.textContent = typographUiText(step.description);
  }

  setMapEvidence(null);
  renderMapRelatedItems();

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

const observationRoute = createObservationRoute({
  clearMapSelection,
  getSelectedMapId: () => selectedMapId,
  getStepPosition: (step) => {
    const item = step.itemId
      ? mapItems.find((candidate) => candidate.id === step.itemId)
      : null;

    return item ? resolveMapLayout(item) : { x: step.x, y: step.y };
  },
  hideMapPreview,
  isTimeModeActive: () => timeModeActive,
  renderShowcase: renderObservationShowcase,
  renderSyntheticStep: renderObservationSyntheticStep,
  selectMapItem,
  setMapFilter,
  setTimeMode,
  writeUrlState,
});
const observationSteps = observationRoute.steps;
const startObservation = (options) => observationRoute.start(options);
const stopObservation = (options) => observationRoute.stop(options);

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
  observationRoute,
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
