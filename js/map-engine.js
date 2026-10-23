import { getTimeLayout } from './map-chronology.js';
import {pane} from './pane-viewport.js';
// Spatial map. Layout rationale: docs/map-layout-notes.md.
import { getCaseContent, loadCaseContent } from "./case-content.js";
import { trackPortfolioEvent } from "./analytics.js";
import { updateWorkTags } from "./work-tags.js";
import {
  mapItems,
  getMapPreviewPoster,
  principlesSourceHref,
} from "./map-data.js";
import { showMapPreview, hideMapPreview, initializeReelReview, renderObservationShowcase, setObservationPlayback } from "./map-media.js";
import { createObservationRoute } from "./observation-route.js";
import { createPersonalMedia } from "./personal-media.js";
import { createSphereSurface } from "./sphere-surfaces.js";
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
const mapQuotation = document.querySelector("[data-map-quotation]");
const mapLink = document.querySelector("[data-map-link]");
const mapInspector = document.querySelector("[data-map-inspector]");
const mapRelated = document.querySelector("[data-map-related]");
const mapRelatedTitle = document.getElementById("map-related-title");
const mapRelatedTrack = document.querySelector("[data-map-related-track]");
const inspectorClose = document.querySelector("[data-close-inspector]");
const mapEvidence = document.querySelector("[data-map-evidence]");
const mapEvidenceTask = document.querySelector("[data-map-evidence-task]");
const mapEvidenceRole = document.querySelector("[data-map-evidence-role]");
const mapEvidenceIdea = document.querySelector("[data-map-evidence-idea]");
const mapEvidenceResult = document.querySelector("[data-map-evidence-result]");
const mapEvidenceFeature = document.querySelector("[data-map-evidence-feature]");
const mapEvidenceDetails = document.querySelector("[data-map-evidence-details]");
const detailState = document.querySelector("[data-case-load-state]");
const detailStatus = detailState.querySelector("[role=status]");
const detailRetry = detailState.querySelector("button");
let detailRequest = 0;
const mapNote = document.querySelector("[data-map-note]");
const timeToggles = Array.from(document.querySelectorAll("[data-time-toggle]"));
const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
const compactMapViewport = pane.media("(max-width: 900px)");
const mapButtons = new Map();
const mapLabels = new Map();
let selectedMapId = null;
let rovingMapId = "garage";
let atmosphereMapId = null;
let searchRelationshipId = null;
let timeModeActive = false;
const mapFilterKinds = ["company", "project", "personal", "practice"];
let activeMapFilters = new Set(mapFilterKinds);
let applyingUrlState = false;
let scheduleMapLinksRender = () => {};
const mapLinkGeometries = new WeakMap();
const mapLinkAnimations = new WeakMap();
const personalMedia = createPersonalMedia({
  inspector: mapInspector,
  returnFocus: () => {
    const selected = mapButtons.get(selectedMapId);
    const target = selected?.getClientRects().length
      ? selected
      : mapButtons.get(rovingMapId);
    target?.focus({ preventScroll: true });
  },
});

const mapNoteDefault = mapNote?.textContent.trim();
const syncMapNote = () => {
  if (!mapNote) return;
  mapNote.textContent = !timeModeActive ? mapNoteDefault
    : mapNote.dataset[atmosphereMapId === "private-practice" ? "practiceTime" : "time"];
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
  const state = { ...window.history.state, ...changes };
  if (changes.point === null) {
    state.inspectorPanelOrigin = null;
    state.inspectorOverviewStep = null;
  }
  window.history[method](state, "", nextUrl);
};

let mapFieldBounds;
let mapTargetSize = 24;
let mapTargetScale = 1;
const mapTargetDiameters = new Map();
const mapTargetHeights = new Map();
const mapTargetDiameter = item => mapTargetDiameters.get(item.id)
  || Math.max(mapTargetSize, item.size * mapTargetScale);
const mapTargetHeight = item => mapTargetHeights.get(item.id) || mapTargetDiameter(item);
let mapConsoleBounds = [];
const mapClearancePositions = new Map();
let mapSpaceGrowth = { x: 0, y: 0 };
const measureMapSpace = () => {
  mapSpaceGrowth = { x: 0, y: 0 };
  if (pane.width <= 900 || timeModeActive || !mapFieldBounds?.width) return;
  const { left, top, width, height } = mapFieldBounds;
  const scale = width / mapNodesRoot.clientWidth;
  const professional = mapItems.filter(item => ["company", "project"].includes(item.kind));
  const north = Math.min(...professional.map(item =>
    top + item.y * height / 100 - Math.max(24, item.size) * scale / 2));
  const east = Math.max(...professional.map(item =>
    left + item.x * width / 100 + Math.max(24, item.size) * scale / 2));
  const northSpan = (54 - Math.min(...professional.map(item => item.y))) * height / 100;
  const eastSpan = (Math.max(...professional.map(item => item.x)) - 50) * width / 100;
  mapSpaceGrowth = {
    x: Math.max(0, Math.min(.2, (pane.width - 24 - east) * .75 / eastSpan)),
    y: Math.max(0, Math.min(.2, (north - 24) * .75 / northSpan)),
  };
};
const homeAnchor = (degrees, radiusX, radiusY) => {
  const angle = degrees * Math.PI / 180;
  return { x: 50 + Math.cos(angle) * radiusX, y: 52 + Math.sin(angle) * radiusY };
};
const focusHomePoints = new Map([
  ["garage", homeAnchor(-130, 35, 43)],
  ["narkomfin", homeAnchor(-55, 42, 34)],
  ["private-practice", homeAnchor(14, 17, 30)],
  ["eleven", { x: 87, y: 65 }],
  ["ks-fish", { x: 58, y: 63 }],
  ["principle-data-intuition", homeAnchor(180, 31, 30)],
  ["running", homeAnchor(83, 40, 42)],
  ["youtube", homeAnchor(136, 42, 55)],
]);
const focusHomeNarrowPoints = new Map([...focusHomePoints,
  ["garage", {x:27,y:22}], ["narkomfin", {x:76,y:20}],
  ["private-practice", {x:67,y:58}],
  ["principle-data-intuition", {x:14,y:48}],
]);
const focusHomeActive = () => pane.width <= 900 && document.body.classList.contains("has-focused-home");
const focusHomeLargeTextPoints = new Map([
  ["garage", { x: 20, y: 12 }],
  ["narkomfin", { x: 76, y: 26 }],
  ["private-practice", { x: 73, y: 41 }],
  ["ks-fish", { x: 45, y: 52 }],
  ["eleven", { x: 82, y: 62 }],
  ["principle-data-intuition", { x: 19, y: 70 }],
  ["running", { x: 43, y: 84 }],
  ["youtube", { x: 19, y: 94 }],
]);
const measureMapClearance = () => {
  const largeTextHome = focusHomeActive() && parseFloat(getComputedStyle(document.documentElement).fontSize) > 20;
  document.body.toggleAttribute("data-mobile-large-text", largeTextHome);
  mapFieldBounds = mapNodesRoot?.getBoundingClientRect();
  mapTargetSize = parseFloat(getComputedStyle(mapNodesRoot).getPropertyValue("--map-target-size")) || 24;
  mapTargetScale = parseFloat(getComputedStyle(mapNodesRoot).getPropertyValue("--map-target-scale")) || 1;
  mapTargetDiameters.clear();
  mapTargetHeights.clear();
  mapButtons.forEach((button, id) => {
    const style = getComputedStyle(button);
    mapTargetDiameters.set(id, parseFloat(style.width));
    mapTargetHeights.set(id, parseFloat(style.height));
  });
  const selectors = [".site-header", ".map-axis-label"];
  if (pane.width > 900) selectors.push(".map-controls", ".map-control > span", ".display-control", ".control-console");
  else selectors.push(".command-dock", ".focused-return", ".mobile-first-dock");
  mapConsoleBounds = [...document.querySelectorAll(selectors.join(","))]
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width && rect.height);
  measureMapSpace();
  mapClearancePositions.clear();
  if (focusHomeActive()) {
    const points = largeTextHome ? focusHomeLargeTextPoints : pane.width < 360 ? focusHomeNarrowPoints : focusHomePoints;
    const shortField = !largeTextHome && mapFieldBounds.height <= 420;
    const museumTop = (mapLabels.get('garage').offsetHeight + mapTargetDiameters.get('garage')/2 + 6 + (shortField ? 20 : 40)) / mapFieldBounds.height * 100;
    const topShift = Math.max(0, museumTop - points.get('garage').y);
    points.forEach((position, id) => {
      let y = position.y + (shortField ? 0 : topShift * Math.max(0, (86 - position.y) / (86 - points.get('garage').y)));
      if (shortField && id === 'garage') y = Math.max(y, museumTop);
      if (shortField && id === 'running') y = 90;
      if (shortField && id === 'youtube') y = 84;
      mapClearancePositions.set(id, { x: position.x, y });
    });
    return;
  }
  const mobileTitles = pane.width <= 900 && !timeModeActive;
  const priorities = ["garage", "private-practice", "running", "narkomfin", "eleven", "ks-fish", "principle-data-intuition"];
  const sorted = [...mapItems].sort((a, b) => {
    const rank = item => mobileTitles && priorities.includes(item.id) ? priorities.indexOf(item.id) : 100;
    return rank(a) - rank(b) || b.size - a.size;
  });
  sorted.forEach(item => {
    if (mapButtons.get(item.id)?.classList.contains('project-satellite')) return;
    const position = clearMapConsoles(item, getMapLayout(item));
    mapClearancePositions.set(item.id, position);
    const label = mapLabels.get(item.id);
    if (!mobileTitles || !label?.classList.contains("mobile-landmark") || label.hasAttribute("data-mobile-hidden")) return;
    const {left, top, width, height} = mapFieldBounds;
    const labelBounds = mapLabelsRoot.getBoundingClientRect();
    const x = labelBounds.left + position.x * labelBounds.width / 100;
    const y = labelBounds.top + position.y * labelBounds.height / 100;
    const targetX = left + position.x * width / 100;
    const targetY = top + position.y * height / 100;
    const labelWidth = label.offsetWidth, labelHeight = label.offsetHeight;
    const radius = mapTargetDiameter(item) * width / mapNodesRoot.clientWidth / 2;
    const radiusY = mapTargetHeight(item) * width / mapNodesRoot.clientWidth / 2;
    const gapX = radius + Math.abs(targetX - x) + 6;
    const gapY = radiusY + Math.abs(targetY - y) + 6;
    const sides = {
      north: [-labelWidth / 2, -gapY - labelHeight],
      south: [-labelWidth / 2, gapY],
      west: [-gapX - labelWidth, -labelHeight / 2],
      east: [gapX, -labelHeight / 2],
    };
    const preferred = item.id === "garage" || item.id === "private-practice" ? "north"
      : item.id === "ks-fish" ? "west" : item.id === "principle-data-intuition" ? "south" : "east";
    const occupied = [...mapConsoleBounds];
    mapClearancePositions.forEach((other, id) => {
      if (id === item.id) return;
      const radius = (mapTargetDiameters.get(id) || 24) * width / mapNodesRoot.clientWidth / 2;
      const radiusY = (mapTargetHeights.get(id) || 24) * width / mapNodesRoot.clientWidth / 2;
      const cx = left + other.x * width / 100, cy = top + other.y * height / 100;
      occupied.push({left: cx-radius, right:cx+radius, top:cy-radiusY, bottom:cy+radiusY});
    });
    const collides = a => occupied.some(b => a.left < b.right+6 && a.right > b.left-6 && a.top < b.bottom+6 && a.bottom > b.top-6);
    let chosen = null;
    for (const side of [preferred, ...Object.keys(sides).filter(side => side !== preferred)]) {
      const [dx,dy] = sides[side];
      const box = {left:x+dx, right:x+dx+labelWidth, top:y+dy, bottom:y+dy+labelHeight};
      if (box.left < 12 || box.right > pane.width-12 || box.top < top || box.bottom > top+height || collides(box)) continue;
      chosen = {box,dx,dy};
      break;
    }
    label.toggleAttribute("data-mobile-no-space", !chosen);
    if (chosen) {
      label.style.setProperty("--mobile-label-dx", `${chosen.dx}px`);
      label.style.setProperty("--mobile-label-dy", `${chosen.dy}px`);
      mapConsoleBounds.push(chosen.box);
    }
  });
};
const clearMapConsoles = (item, position) => {
  if (!mapFieldBounds?.width || !mapConsoleBounds.length) return position;
  const { left, top, width, height } = mapFieldBounds;
  const padding = pane.width > 900 ? 8 : 4;
  const radius = mapTargetDiameter(item) * width / mapNodesRoot.clientWidth / 2 + padding;
  const radiusY = mapTargetHeight(item) * width / mapNodesRoot.clientWidth / 2 + padding;
  const point = [left + position.x * width / 100, top + position.y * height / 100];
  const covers = ([x, y], rect) => x > rect.left - radius && x < rect.right + radius
    && y > rect.top - radiusY && y < rect.bottom + radiusY;
  const obstacle = mapConsoleBounds.find(rect => covers(point, rect));
  const [x, y] = point;
  const isFree = candidate => candidate[0] >= radius && candidate[0] <= pane.width - radius
    && candidate[1] >= radiusY && candidate[1] <= pane.height - radiusY
    && !mapConsoleBounds.some(rect => covers(candidate, rect))
    && !mapItems.some(other => {
      if (other.id === item.id) return false;
      const position = mapClearancePositions.get(other.id);
      if (!position) return false;
      const otherRadius = mapTargetDiameter(other) * width / mapNodesRoot.clientWidth / 2;
      const otherRadiusY = mapTargetHeight(other) * width / mapNodesRoot.clientWidth / 2;
      const clearance = radius - padding + otherRadius + (pane.width > 900 ? 4 : 2);
      const clearanceY = radiusY - padding + otherRadiusY + (pane.width > 900 ? 4 : 2);
      return Math.abs(candidate[0] - left - position.x * width / 100) < clearance
        && Math.abs(candidate[1] - top - position.y * height / 100) < clearanceY;
    });
  if (isFree(point)) return position;
  const candidates = (obstacle ? [
    [obstacle.left - radius, y], [obstacle.right + radius, y],
    [x, obstacle.top - radiusY], [x, obstacle.bottom + radiusY],
  ] : []).filter(isFree);
  const increment = pane.width > 900 ? 12 : 6;
  for (let distance = increment; !candidates.length && distance < Math.max(pane.width, pane.height); distance += increment) {
    const steps = pane.width > 900 ? 24 : Math.max(24, Math.ceil(2 * Math.PI * distance / 6));
    for (let step = 0; step < steps; step++) {
      const angle = step * 2 * Math.PI / steps;
      const candidate = [x + Math.cos(angle) * distance, y + Math.sin(angle) * distance];
      if (isFree(candidate)) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y));
  const target = candidates[0] || point;
  return { x: (target[0] - left) / width * 100, y: (target[1] - top) / height * 100 };
};

const getMapLayout = (item) => {
  const viewportWidth = pane.width;
  let x = item.x;
  let y = item.y;

  if (timeModeActive && Number.isFinite(item.timeYear)) {
    return getTimeLayout(item, pane.width <= 900);
  }

  if (viewportWidth >= 901 && viewportWidth <= 1100) {
    const tabletOverrides = {
      ilmix: { x: 19 },
      "principle-system": { x: 18 },
      "principle-wings": { y: 43 },
    };
    const override = tabletOverrides[item.id];

    x = override?.x ?? x;
    y = override?.y ?? y;

  } else if (viewportWidth <= 900) {
    if (item.id === "private-practice" && !timeModeActive) {
      x = 67;
      y = 56;
    }
    if (item.id === "garage-site") {
      x = viewportWidth <= 360 ? 63 : 60;
    }
    if (item.id === "doronin") x = 86;
  }

  if (viewportWidth <= 360) {
    const compactOverrides = {
      "garage-archives": { x: 62, y: 29 },
      eleven: { x: 78, y: 71 },
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

  if (viewportWidth <= 900) {
    if (!timeModeActive) y = 14 + (y - 14) * 1.18;
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
      (signalField?.clientHeight || pane.height)
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
  } else if (["company", "project"].includes(item.kind)) {
    x += Math.max(0, x - 50) * mapSpaceGrowth.x;
    y -= Math.max(0, 54 - y) * mapSpaceGrowth.y;
  }

  return { x, y };
};
const resolveMapLayout = item => mapClearancePositions.get(item.id) || getMapLayout(item);

const setMapDescription = (value, credit) => {
  if (!mapDescription) return;
  const text = typographUiText(value);
  mapDescription.textContent = text;
  if (!credit) return;
  const label = typographUiText(credit.label);
  const index = text.indexOf(label);
  if (index < 0) return;
  const link = document.createElement("a");
  link.className = "text-link";
  link.href = credit.href;
  link.textContent = label;
  link.target = "_blank";
  link.rel = "noreferrer";
  mapDescription.replaceChildren(text.slice(0, index), link, text.slice(index + label.length));
};

const setMapQuotation = quote => {
  if (!mapQuotation) return;
  mapQuotation.hidden = !quote;
  mapQuotation.querySelector("blockquote").textContent = typographUiText(quote?.text || "");
  mapQuotation.querySelector("figcaption").textContent = typographUiText(quote?.source || "");
};

const placeMapLabel = (item, label) => {
  if (["garage", "private-practice"].includes(item.id) || label.classList.contains("map-space-label")) return;
  const field = mapLabelsRoot.getBoundingClientRect();
  if (!field.width) return;
  const scale = field.width / mapLabelsRoot.clientWidth;
  const x = field.left + label.offsetLeft * scale;
  const y = field.top + label.offsetTop * scale;
  const width = label.offsetWidth * scale;
  const height = label.offsetHeight * scale;
  const offset = Number.parseFloat(label.style.getPropertyValue("--label-offset")) * scale;
  const top = y - height / 2;
  const score = left => {
    const right = left + width;
    return (Math.max(0, 8 - left) + Math.max(0, right - pane.width + 8)) * height
      + mapConsoleBounds.reduce((area, panel) => area
        + Math.max(0, Math.min(right, panel.right + 8) - Math.max(left, panel.left - 8))
        * Math.max(0, Math.min(top + height, panel.bottom + 8) - Math.max(top, panel.top - 8)), 0);
  };
  const east = score(x + offset);
  const west = score(x - offset - width);
  label.classList.toggle("map-node-label--west", west < east || (west === east && item.x >= 72));
};

const placeMapRestLabels = () => {
  mapLabels.forEach(label => label.classList.remove("map-space-label", "map-space-label--north", "map-space-label--south"));
  if (pane.width <= 900 || timeModeActive || !document.documentElement.dataset.mapControlsReady) return;
  const field = mapLabelsRoot.getBoundingClientRect();
  const scale = field.width / mapLabelsRoot.clientWidth;
  const overlaps = (a, b, gap = 12) => a.left < b.right + gap && a.right > b.left - gap
    && a.top < b.bottom + gap && a.bottom > b.top - gap;
  const occupied = [...mapConsoleBounds];
  mapItems.forEach(item => {
    const { x, y } = resolveMapLayout(item);
    const radius = Math.max(24, item.size) * scale / 2;
    const cx = field.left + x * field.width / 100, cy = field.top + y * field.height / 100;
    occupied.push({ left: cx - radius, right: cx + radius, top: cy - radius, bottom: cy + radius, id: item.id });
  });
  const labelRect = (item, side) => {
    const label = mapLabels.get(item.id), position = resolveMapLayout(item);
    const width = label.offsetWidth * scale, height = label.offsetHeight * scale;
    const offset = parseFloat(label.style.getPropertyValue(item.id === "garage" ? "--garage-label-offset" : "--label-offset")) * scale;
    const x = field.left + position.x * field.width / 100, y = field.top + position.y * field.height / 100;
    const centered = ["garage", "private-practice"].includes(item.id) || side === "north" || side === "south";
    const left = centered ? x - width / 2 : side === "west" ? x - offset - width : x + offset;
    const top = item.id === "garage" ? y + offset : item.id === "private-practice" || side === "north" ? y - offset - height
      : side === "south" ? y + offset : y - height / 2;
    return { left, right: left + width, top, bottom: top + height };
  };
  ["garage", "private-practice", "running"].forEach(id => occupied.push(labelRect(mapItems.find(item => item.id === id), "west")));
  const featured = ["early-career", "ilmix", "narkomfin", "eleven", "ks-fish", "principle-data-intuition", "herman"];
  for (const id of featured) {
    const item = mapItems.find(candidate => candidate.id === id);
    const label = mapLabels.get(item.id);
    const sides = item.x >= 72 ? ["west", "east", "north", "south"] : ["east", "west", "north", "south"];
    for (const side of sides) {
      const rect = labelRect(item, side);
      if (rect.left < 24 || rect.right > pane.width - 24 || rect.top < 24 || rect.bottom > pane.height - 24
        || occupied.some(obstacle => obstacle.id !== item.id && overlaps(rect, obstacle))) continue;
      label.classList.toggle("map-node-label--west", side === "west");
      label.classList.toggle("map-space-label--north", side === "north");
      label.classList.toggle("map-space-label--south", side === "south");
      label.classList.add("map-space-label");
      occupied.push(rect);
      break;
    }
  }
};

const applyMapLayout = () => {
  measureMapClearance();
  mapItems.forEach((item) => {
    const position = resolveMapLayout(item);
    const button = mapButtons.get(item.id);
    const label = mapLabels.get(item.id);

    button?.style.setProperty("--x", `${position.x}%`);
    button?.style.setProperty("--y", `${position.y}%`);
    label?.style.setProperty("--x", `${position.x}%`);
    label?.style.setProperty("--y", `${position.y}%`);
    label?.classList.toggle("is-time-undated", timeModeActive && !Number.isFinite(item.timeYear));
    if (label?.classList.contains("is-visible")) placeMapLabel(item, label);

  });
  if (!focusHomeActive()) placeMapRestLabels();
  syncMapAtmospherePosition();
  window.dispatchEvent(new Event("map-layout"));
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

const atmosphere = Object.assign(document.createElement("canvas"), { className: "map-atmosphere", ariaHidden: "true" }).getContext("2d");
signalField.prepend(atmosphere.canvas);
const buffer = atmosphere.canvas.cloneNode().getContext("2d"), backdrops = new Map();
let backdropSize, backdropFrame;
atmosphere.canvas.addEventListener("contextrestored", () => { backdropFrame = null; syncMapAtmospherePosition(); });
const drawMapAtmosphere = ({width, height}, x, y) => {
  if (pane.width <= 900) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.ceil(width*dpr), h = Math.ceil(height*dpr);
  const size = `${w}/${h}`;
  if (size !== backdropSize) { backdrops.clear(); backdropSize = size; }
  const bg = getComputedStyle(signalField, "::before").backgroundImage.replace(/^radial-gradient.*?%\),\s*/, "");
  let image = backdrops.get(bg);
  if (!image) {
    image = new Image(); backdrops.set(bg, image); image.onload = syncMapAtmospherePosition;
    image.src = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:${bg}"/></foreignObject></svg>`);
  }
  if (!image.naturalWidth) return;
  const color = getComputedStyle(signalField).getPropertyValue("--map-focus-accent").trim();
  const frame = `${size}/${bg}/${x}/${y}/${color}`;
  if (frame === backdropFrame) return;
  if (atmosphere.canvas.width !== w || atmosphere.canvas.height !== h) {
    atmosphere.canvas.width = buffer.canvas.width = w; atmosphere.canvas.height = buffer.canvas.height = h;
  }
  x *= w/100; y *= h/100;
  const idle = !atmosphereMapId && document.documentElement.hasAttribute("data-celestial-volume");
  const radius = Math.hypot(Math.max(x,w-x), Math.max(y,h-y)) * (idle ? .24 : .21);
  buffer.globalCompositeOperation = "copy"; buffer.drawImage(image,0,0); buffer.globalCompositeOperation = "source-over";
  const light = buffer.createRadialGradient(x,y,0,x,y,radius);
  light.addColorStop(0,color); light.addColorStop(1,"transparent");
  const lightTheme = document.documentElement.dataset.theme === "light";
  buffer.globalAlpha = idle ? (lightTheme ? .04 : .06) : (lightTheme ? .1 : .14);
  buffer.fillStyle = light; buffer.fillRect(0,0,w,h); buffer.globalAlpha = 1;
  atmosphere.globalCompositeOperation = "copy"; atmosphere.drawImage(buffer.canvas,0,0);
  signalField.dataset.atmosphereBuffered = "";
  backdropFrame = frame;
};

const syncMapAtmospherePosition = () => {
  const point = mapButtons.get(atmosphereMapId)?.getBoundingClientRect();
  const field = signalField.getBoundingClientRect(), style = signalField.style;
  if (!field.width || !field.height) return;
  const x = point ? (point.x + point.width / 2 - field.x) / field.width * 100 : 50;
  const y = point ? (point.y + point.height / 2 - field.y) / field.height * 100 : 54;
  drawMapAtmosphere(field, x, y);
  style.setProperty("--focus-x", `${x}%`);
  style.setProperty("--focus-y", `${y}%`);
  if (signalField.dataset.focusPlane) style.setProperty("--focus-horizon-x", `${(x + 12) / 1.24}%`);
};

new MutationObserver(() => syncMapAtmospherePosition()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-contrast", "data-celestial-volume"] });

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
    syncMapAtmospherePosition();
    syncMapRelationships();
    syncMapNote();
    return;
  }

  atmosphereMapId = item.id;
  signalField.dataset.focusId = item.id;
  signalField.dataset.focusKind = item.accentKind || item.kind;

  if (getMapLayout(item).y >= 74) {
    signalField.dataset.focusPlane = "ground";
  } else {
    delete signalField.dataset.focusPlane;
    signalField.style.removeProperty("--focus-horizon-x");
  }
  syncMapAtmospherePosition();
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

  mapMeta.hidden = !text;
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
      && !button.hasAttribute("data-orbit-decorative")
      && (!focusHomeActive() || focusHomePoints.has(item.id))
      && (!timeModeActive || Number.isFinite(item.timeYear))
      && !button.classList.contains("is-search-miss")
      && (focusHomeActive() || activeMapFilters.has(item.kind));
  })
);

const syncMapNodeAvailability = () => {
  const hasCustomFilters = activeMapFilters.size < mapFilterKinds.length;

  mapItems.forEach((item) => {
    const button = mapButtons.get(item.id);

    if (!button) {
      return;
    }

    const isAvailable = !button.hasAttribute("data-orbit-decorative")
      && (!focusHomeActive() || focusHomePoints.has(item.id))
      && (!timeModeActive || Number.isFinite(item.timeYear))
      && !button.classList.contains("is-search-miss")
      && (focusHomeActive() || activeMapFilters.has(item.kind));

    button.inert = !isAvailable;
    button.setAttribute("aria-hidden", String(!isAvailable));
    mapLabels.get(item.id)?.classList.toggle("map-label-unavailable", !isAvailable);
    button.classList.toggle("is-filter-miss", !focusHomeActive() && !activeMapFilters.has(item.kind));
    button.classList.toggle(
      "is-filter-match",
      hasCustomFilters && (focusHomeActive() || activeMapFilters.has(item.kind)),
    );
  });
};

const setMapRovingId = (id, { focus = false } = {}) => {
  if (mapButtons.get(id)?.hasAttribute("data-orbit-decorative")) id = "private-practice";
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
  const screenPosition = item => {
    const rect = mapButtons.get(item.id).getBoundingClientRect();
    return { x: (rect.left + rect.width / 2) / pane.width * 100,
      y: (rect.top + rect.height / 2) / pane.height * 100 };
  };
  const currentPosition = screenPosition(current);

  return candidates
    .filter((item) => item.id !== id)
    .map((item) => {
      const position = screenPosition(item);
      const dx = ((position.x - currentPosition.x) / 100) * pane.width;
      const dy = ((position.y - currentPosition.y) / 100) * pane.height;
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

const setMapEvidence = (evidence = null, item = null) => {
  const entries = [
    [mapEvidenceTask, evidence?.task],
    [mapEvidenceRole, evidence?.role],
    [mapEvidenceIdea, evidence?.idea],
    [mapEvidenceResult, evidence?.result],
    [mapEvidenceFeature, evidence?.feature],
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
    const field = element.getAttributeNames().find(name => name.startsWith("data-map-evidence-"))?.replace("data-map-evidence-", "");
    const label = row?.querySelector("dt");
    if (label) {
      label.dataset.defaultLabel ||= label.textContent;
      label.textContent = typographUiText(evidence?.labels?.[field] || label.dataset.defaultLabel);
    }
    for (const figure of (item?.figures || []).filter(figure => figure.field === field)) {
      const frame = document.createElement("figure");
      frame.className = "case-figure";
      const image = document.createElement("img");
      image.src = figure.src;
      image.alt = typographUiText(figure.alt);
      image.width = figure.width;
      image.height = figure.height;
      image.loading = "lazy";
      image.decoding = "async";
      const caption = document.createElement("figcaption");
      caption.textContent = typographUiText(figure.caption);
      frame.append(image, caption);
      if (!element.querySelector(".map-evidence__copy")) {
        const prose = document.createElement("p");
        prose.className = "map-evidence__copy";
        prose.textContent = element.textContent;
        element.replaceChildren(prose);
      }
      element.append(frame);
    }
  });

  mapEvidenceDetails.hidden = !evidence?.details;
  mapEvidenceDetails.querySelectorAll("[data-case-copy]").forEach(element => {
    const value = evidence?.[element.dataset.caseCopy];
    element.closest(".case-details__part").hidden = !value;
    element.textContent = typographUiText(value || "");
  });

  if (mapEvidenceRole && evidence?.role && evidence.roleSource) {
    const link = document.createElement("a");
    link.className = "text-link";
    link.href = evidence.roleSource.href;
    link.textContent = evidence.roleSource.label;
    link.target = "_blank";
    link.rel = "noreferrer";
    mapEvidenceRole.append(" ", link);
  }
};

const renderMapRelatedItems=(item=null)=>{
  const links=new Map();
  if(item&&!observationRoute.active){
    const ids=[...(item.relatedTo||[]),...mapItems.filter(candidate=>
      item.kind==="personal"&&candidate.relatedTo?.includes(item.id)
      ||candidate.parent===item.id||candidate.id===item.parent).map(candidate=>candidate.id)];
    for(const id of ids)links.set(id,null);
    for(const [id,reason] of getCaseContent()?.related?.[item.id]||[])links.set(id,reason);
  }
  const items=[...links].map(([id,reason])=>({item:mapItems.find(item=>item.id===id),reason})).filter(({item})=>item);
  mapRelated.hidden=!items.length;
  mapRelated.dataset.relatedKind=item?.kind==="personal"?"personal":"project";
  mapRelatedTitle.textContent=items.every(({item})=>item.kind==="project")?"СВЯЗАННЫЕ ПРОЕКТЫ":"СВЯЗАННЫЕ ТОЧКИ";
  mapRelatedTrack.innerHTML=items.map(({item,reason})=>{
    const {id,label,timeLabel,timeYear,kindLabel}=item,poster=getMapPreviewPoster(item);
    const caption=typographUiText(reason||[kindLabel.split(" / ")[0],timeLabel||timeYear].filter(Boolean).join(" / "));
    return `<li><a class="map-related__item" href="?point=${id}"><strong>${label}</strong><span>${caption}</span>${poster?`<img class="map-related__preview${item.relatedPosterShape==="circle"?" map-related__preview--circle":""}" data-preview-src="${poster}" alt="" decoding="async" width="72" height="48">`:""}</a></li>`;
  }).join("");
};
const loadRelatedPreview = event => {
  const link=event.target.closest(".map-related__item");
  if (!link || !hoverCapable.matches || (event.type==="focusin" && !link.matches(":focus-visible"))) return;
  const image=link.querySelector("[data-preview-src]");
  if (!image || image.hasAttribute("src")) return;
  image.addEventListener("load",()=>image.classList.add("is-ready"),{once:true});
  image.src=image.dataset.previewSrc;
};
mapRelatedTrack.addEventListener("pointerover",loadRelatedPreview);
mapRelatedTrack.addEventListener("focusin",loadRelatedPreview);
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
  personalMedia.select(isOpen
    ? mapItems.find((item) => item.id === selectedMapId)
    : null);
  window.dispatchEvent(new Event("reading-surface-change"));
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
    overview = null,
  } = {},
) => {
  const item = mapItems.find((candidate) => candidate.id === id);

  if (!item) {
    return;
  }

  if (observationRoute.active && !overview) {
    if (!reveal) return;
    stopObservation({ updateHistory: false, closeInspector: false });
  }
  const caseStudy = overview ? null : item.caseStudy;
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
    mapKind.textContent = typographUiText(overview?.kind || caseStudy?.kindLabel || item.kindLabel);
  }

  if (mapTitle) {
    mapTitle.textContent = typographUiText(overview?.title || caseStudy?.title || item.displayTitle || item.title);
    mapTitle.setAttribute("aria-label", typographUiText(overview?.title || caseStudy?.title || item.title));
  }

  const hasWorkTags = updateWorkTags(mapTitle.parentElement, overview ? null : item.id);
  if (hasWorkTags) mapLink.before(mapTitle.parentElement.querySelector('.work-tags'));
  if (mapMeta) {
    setMapMetaText(overview?.meta ?? (hasWorkTags && item.kind === 'project' ? '' : caseStudy?.meta ?? item.meta));
  }

  const renderDetails = () => {
    setMapDescription(overview?.description || caseStudy?.description || item.description, item.descriptionCredit);
    setMapQuotation(overview ? null : item.quote);
    setMapEvidence(overview ? null : getCaseContent()?.evidence[item.id], overview ? null : item);
  };
  const request = ++detailRequest;
  const current = () => request === detailRequest && selectedMapId === id && mapInspector.classList.contains("is-open");
  detailState.hidden = true;
  renderDetails();
  if (!overview && (reveal || mapInspector.classList.contains("is-open")) && !getCaseContent()) {
    const loadDetails = () => {
      detailState.hidden = false;
      detailStatus.textContent = "Загружаются подробности…";
      detailRetry.hidden = true;
      loadCaseContent().then(() => {
        if (!current()) return;
        renderDetails();
        renderMapRelatedItems(item);
        if (document.activeElement === detailRetry) mapTitle.focus({ preventScroll: true });
        detailState.hidden = true;
      }).catch(() => {
        if (!current()) return;
        detailStatus.textContent = "Не удалось загрузить подробности.";
        detailRetry.hidden = false;
      });
    };
    detailRetry.onclick = loadDetails;
    loadDetails();
  }

  if (mapLink) {
    const itemHref = overview ? `?point=${item.id}` : item.href || (item.kind === "practice" ? principlesSourceHref : "");

    if (itemHref) {
      mapLink.hidden = false;
      mapLink.href = itemHref;
      mapLink.textContent = typographUiText(overview ? (overview.linkLabel || (["company", "project"].includes(item.kind) ? "ОТКРЫТЬ КЕЙС" : "О ПРИНЦИПЕ")) : item.linkLabel
        || (item.kind === "practice" ? "ПРИНЦИПЫ В\u00a0NOTION" : "ОТКРЫТЬ САЙТ"));
      mapLink.classList.remove("is-disabled");
      mapLink.removeAttribute("aria-disabled");
      mapLink.target = overview ? "_self" : "_blank";
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
  if (mapInspector) mapInspector.scrollTop = 0;

  if (reveal) {
    setInspectorOpen(true);
  } else if (mapInspector?.classList.contains("is-open")) {
    personalMedia.select(item);
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

let inspectorReturnHandler = null;
const setInspectorReturnHandler = (handler) => { inspectorReturnHandler = handler; };

inspectorClose?.addEventListener("click", () => {
  if (observationRoute.active) {
    exitObservation();
    return;
  }

  if (inspectorReturnHandler?.()) return;
  const selectedButton = mapButtons.get(selectedMapId);
  clearMapSelection({ updateHistory: true });
  selectedButton?.focus();
  if (document.activeElement !== selectedButton) requestAnimationFrame(() => {
    if (document.activeElement === document.body || mapInspector.contains(document.activeElement)) selectedButton?.focus();
  });
});

const sphereTurnSeconds = new Map([
  ["optimal", 96], ["ilmix", 108],
  ["youtube", 88], ["parfenov", 104],
]);

if (mapNodesRoot) {
  measureMapClearance();
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
    const glyphScale = item.shape === "sphere"
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

    if (item.shape === "sphere") {
      button.classList.add("map-node--sphere", `map-node--${item.id}`);
    }

    if (item.parent === "garage") {
      button.classList.add("map-node--garage-child");
    }

    if (item.x >= 72) {
      button.classList.add("map-node--label-west");
    }

    glyph.className = "map-node__glyph";
    glyph.setAttribute("aria-hidden", "true");
    const sphereTurn = sphereTurnSeconds.get(item.id);
    if (sphereTurn) {
      glyph.append(createSphereSurface(item.id, sphereTurn, (item.x + item.y) / sphereTurn));
    }
    label.className = `map-node-label map-node-label--${item.kind}`;
    label.dataset.mapLabelId = item.id;
    label.dataset.materialSurface = "map-node-label";
    label.dataset.materialActive = "always";
    if (Number.isFinite(item.timeYear)) {
      label.dataset.timeYear = String(item.timeYear);
      label.dataset.timeLabel = item.timeLabel || String(item.timeYear);
    }
    label.append(Object.assign(document.createElement("span"), { textContent: typographUiText(item.label) }));
    label.style.setProperty("--x", `${position.x}%`);
    label.style.setProperty("--y", `${position.y}%`);
    label.style.setProperty("--label-offset", `${glyphDiameter / 2 + 7}px`);
    label.style.setProperty("--garage-label-offset", `${glyphDiameter * .65 + 12}px`);

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
      if (button.classList.contains("project-satellite")) return;
      mapLabels.forEach((candidate) => {
        candidate.classList.remove("is-visible");
      });

      if (!compactMapViewport.matches) {
        placeMapLabel(item, label);
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
      if (compactMapViewport.matches && document.body.hasAttribute("data-mobile-preview-ui")) {
        window.dispatchEvent(new CustomEvent("mobile-point-request", { detail: { id: item.id } }));
        return;
      }
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
      if (compactMapViewport.matches && document.body.hasAttribute("data-mobile-preview-ui")) return;
      selectMapItem(item.id);
    });
    button.addEventListener("blur", hideLabel);

    if (item.previewVideo) {
      button.addEventListener("pointerenter", () => {
        if (button.classList.contains("project-satellite")) hideMapPreview({ immediate: true });
        else showMapPreview(item);
      });
      button.addEventListener("pointerleave", () => hideMapPreview());
      button.addEventListener("focus", () => {
        if (button.classList.contains("project-satellite")) hideMapPreview({ immediate: true });
        else showMapPreview(item);
      });
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

initializeReelReview();

if (mapLinksRoot) {
  const itemById = new Map(mapItems.map((item) => [item.id, item]));
  const childrenByParent = new Map();

  mapItems.forEach((item) => {
    const connections = new Set([item.parent, ...(item.relatedTo || [])].filter(Boolean));
    connections.forEach((id) => {
      if (id === item.id || !itemById.has(id)) return;
      const siblings = childrenByParent.get(id) || [];
      siblings.push(item);
      childrenByParent.set(id, siblings);
    });
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
        radius: (item.id === "garage" && glyph.querySelector(".celestial-volume--garage")?.getBoundingClientRect().width * (.434 / 2.7)) || Math.max(rect.width, rect.height) / 2,
      };
    };

    const visibleItems = focusHomeActive() ? mapItems.filter(item => focusHomePoints.has(item.id)) : mapItems;
    const nodeGeometry = new Map(visibleItems.map(item => [item.id, getNodeGeometry(item)]));
    const obstacles = [...nodeGeometry].filter(([id]) => (
      !timeModeActive || mapButtons.get(id)?.hasAttribute("data-time-year")
    ));

    childrenByParent.forEach((children, parentId) => {
      const parent = nodeGeometry.get(parentId);
      if (!parent) return;
      const measured = children.filter(item => nodeGeometry.has(item.id)).map(item => {
        const geometry = nodeGeometry.get(item.id);
        return { item, geometry, angle: Math.atan2(
          geometry.centerY - parent.centerY, geometry.centerX - parent.centerX,
        ) };
      }).sort((a, b) => a.angle - b.angle);
      if (!measured.length) return;
      const gaps = measured.map((child, i) => (
        (measured[(i + 1) % measured.length].angle - child.angle + Math.PI * 2) % (Math.PI * 2)
      ));
      const split = gaps.indexOf(Math.max(...gaps)) + 1;
      const ordered = [...measured.slice(split), ...measured.slice(0, split)];
      ordered.forEach((child, i) => {
        if (i && child.angle < ordered[i - 1].angle) child.angle += Math.PI * 2;
      });
      const ports = ordered.map(child => child.angle);
      const spacing = Math.min(0.18, 7 / (parent.radius + 3));
      for (let pass = 0; pass < ports.length; pass += 1) {
        for (let i = 1; i < ports.length; i += 1) {
          const spread = Math.max(0, spacing - ports[i] + ports[i - 1]) / 2;
          ports[i - 1] -= spread;
          ports[i] += spread;
        }
      }
      let previousPort = -Infinity;

      ordered.forEach(({ item, geometry, angle }, index) => {
        const dx = geometry.centerX - parent.centerX;
        const dy = geometry.centerY - parent.centerY;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = -dy / distance, ny = dx / distance;
        const gap = Math.max(1, distance - parent.radius - geometry.radius - 5);
        const garageFlow = parentId === "garage";
        const restBend = garageFlow ? 0.08 : 0.84;
        const preferred = garageFlow ? gap * 0.22
          : distance * Math.tan(ports[index] - angle + 0.04) / 2;
        const neighbours = obstacles.flatMap(([id, node]) => {
          if (id === parentId || id === item.id) return [];
          const x = node.centerX - parent.centerX, y = node.centerY - parent.centerY;
          const t = (x * dx + y * dy) / (distance * distance);
          return t > 0 && t < 1
            ? [{ factor: 2 * t * (1 - t), offset: x * nx + y * ny, radius: node.radius + 5 }]
            : [];
        });
        let bend = gap * 0.08, bestScore = Infinity, leastObstruction = Infinity;
        for (let step = -12; step <= 12; step += 1) {
          if (Math.abs(step) < 3) continue;
          const candidate = gap * step * 0.02;
          const port = angle + Math.atan2(2 * candidate, distance);
          const score = (candidate - preferred) ** 2
            + (Math.max(0, spacing - port + previousPort) * distance) ** 2;
          let obstruction = 0;
          neighbours.forEach(({ factor, offset, radius }) => {
            const base = offset - factor * candidate * restBend;
            const active = offset - factor * candidate;
            const clearance = base * active < 0 ? 0 : Math.min(Math.abs(base), Math.abs(active));
            obstruction += Math.max(0, radius - clearance) ** 2;
          });
          if (obstruction < leastObstruction || (obstruction === leastObstruction && score < bestScore)) {
            leastObstruction = obstruction;
            bestScore = score;
            bend = candidate;
          }
        }
        previousPort = angle + Math.atan2(2 * bend, distance);
        const curve = (bow) => {
          const point = t => [
            parent.centerX + dx * t + nx * 2 * t * (1 - t) * bow,
            parent.centerY + dy * t + ny * 2 * t * (1 - t) * bow,
          ];
          const trim = (node, end) => {
            let low = 0, high = 0.5;
            for (let i = 0; i < 12; i += 1) {
              const t = (low + high) / 2;
              const p = point(end ? 1 - t : t);
              if (Math.hypot(p[0] - node.centerX, p[1] - node.centerY) < node.radius + 3) low = t;
              else high = t;
            }
            return end ? 1 - high : high;
          };
          const from = trim(parent, false), to = trim(geometry, true);
          const start = point(from), end = point(to);
          const control = [
            start[0] + (to - from) * (dx / 2 + nx * (1 - 2 * from) * bow),
            start[1] + (to - from) * (dy / 2 + ny * (1 - 2 * from) * bow),
          ];
          return formatMapLinkCurve([
            ...start,
            ...start.map((value, i) => value + (control[i] - value) * 2 / 3),
            ...end.map((value, i) => value + (control[i] - value) * 2 / 3),
            ...end,
          ].map((value, i) => value * 100 / (i % 2 ? bounds.height : bounds.width)));
        };
        const baseD = curve(bend * restBend);
        const reactiveD = curve(bend);
        const relationKey = `${parentId}:${item.id}`;
        const path = mapLinksRoot.querySelector(`path[data-relation-key="${relationKey}"]`)
          || document.createElementNS(svgNamespace, "path");

        path.dataset.baseD = baseD;
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
    mapLinksRoot.dataset.layoutPending = "";
    window.cancelAnimationFrame(mapLinksResizeFrame);
    window.clearTimeout(mapLinksSettleTimer);
    mapLinksResizeFrame = window.requestAnimationFrame(() => {
      applyMapLayout();
      renderMapLinks();
    });
    mapLinksSettleTimer = window.setTimeout(() => {
      applyMapLayout();
      renderMapLinks();
      delete mapLinksRoot.dataset.layoutPending;
    }, 940);
  };

  renderMapLinks();
  reducedMotion.addEventListener?.("change", () => syncMapRelationships());
  mapNodesRoot.parentElement.addEventListener("transitionend", (event) => {
    if ((event.propertyName === "transform"
      && [mapLinksRoot, mapNodesRoot.parentElement].includes(event.target))
      || (["top", "left"].includes(event.propertyName) && event.target.matches(".map-node"))) {
      renderMapLinks();
    }
  });
  window.addEventListener("resize", scheduleMapLinksRender, { passive: true });
  document.fonts?.ready.then(scheduleMapLinksRender);
  const clearanceResize = new ResizeObserver(scheduleMapLinksRender);
  clearanceResize.observe(mapNodesRoot);
  document.querySelectorAll(".map-controls, .display-control, .control-console, .site-header, .mobile-index-links")
    .forEach(element => clearanceResize.observe(element));
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
  let metaMeasureFrame = 0;
  new ResizeObserver(() => {
    if (metaMeasureFrame) return;
    metaMeasureFrame = requestAnimationFrame(() => { metaMeasureFrame = 0; syncMapMetaOverflow(); });
  }).observe(mapMeta);
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
        { view: nextEnabled ? "time" : null, hash: "#map" },
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
      `ХРОНОЛОГИЯ. ${nextEnabled ? "Вернуть смысловую карту" : "Показывать хронологию"}`,
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
        hash: "#map",
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
  delete signalField.dataset.selectedKind;
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
  updateWorkTags(mapTitle.parentElement, null);

  setMapDescription(step.description);
  setMapQuotation(null);

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
    const item = step.itemId ? mapItems.find(candidate => candidate.id === step.itemId) : null;
    return item ? resolveMapLayout(item) : { x: step.x, y: step.y };
  },
  hideMapPreview,
  isTimeModeActive: () => timeModeActive,
  renderShowcase: renderObservationShowcase,
  setShowcasePaused: setObservationPlayback,
  renderSyntheticStep: renderObservationSyntheticStep,
  selectMapItem,
  setMapFilter,
  setTimeMode,
  writeUrlState,
});
const observationSteps = observationRoute.steps;
const startObservation = (options) => observationRoute.start(options);
const stopObservation = (options) => observationRoute.stop(options);
const exitObservation = () => observationRoute.exit();

const requestMapLinksRender = () => {
  scheduleMapLinksRender();
};

const setApplyingUrlState = (isApplying) => {
  applyingUrlState = Boolean(isApplying);
};

export {
  clearMapSelection,
  getNavigableMapItems,
  inspectorClose,
  mapButtons,
  mapInspector,
  normalizeMapFilters,
  observationRoute,
  observationSteps,
  requestMapLinksRender,
  rovingMapId,
  selectedMapId,
  selectMapItem,
  setApplyingUrlState,
  setInspectorOpen,
  setInspectorReturnHandler,
  setMapFilter,
  setMapRovingId,
  setSearchRelationshipPreview,
  setTimeMode,
  startObservation,
  stopObservation,
  exitObservation,
  syncMapNodeAvailability,
  syncMapAtmospherePosition,
  timeModeActive,
  writeUrlState,
};
