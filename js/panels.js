import { isMapPreviewActive, hideMapPreview } from "./map-media.js";
import {
  openSettingsPanel,
  trackPortfolioEvent,
} from "./analytics.js";
import { mapItems, getMapPreviewPoster } from "./map-data.js";
import {
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
  syncMapNodeAvailability,
  timeModeActive,
  writeUrlState,
} from "./map-engine.js";
import {
  getTabStops,
  reducedMotion,
  typographUiText,
} from "./preferences.js";
import { signalField } from "./signal-field.js";

import {
  scrollRegionFromKey,
  clearCommandViewportPosition,
  compactCommandViewport,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
} from "./viewport-ui.js";

const constellationNav = document.querySelector("[data-constellation-nav]");
const constellationNavToggle = document.querySelector("[data-constellation-nav-toggle]");
const constellationNavToggleLabel = document.querySelector("[data-constellation-nav-toggle-label]");
const constellationNavOrbit = document.querySelector("[data-constellation-nav-orbit]");
const constellationNavItems = Array.from(document.querySelectorAll("[data-nav-view]"));
const constellationNavHome = document.querySelector('[data-nav-view="map"]');
const compactConstellationNav = window.matchMedia("(max-width: 900px)");
const controlConsole = document.querySelector(".control-console");
let isConstellationNavOpen = false;

export const syncConstellationNavInteractivity = () => {
  if (controlConsole) controlConsole.inert = document.body.hasAttribute("data-case-open")
    || (compactConstellationNav.matches && document.body.classList.contains("has-content-panel"));
  if (constellationNav) {
    constellationNav.inert = compactConstellationNav.matches && document.body.classList.contains("has-content-panel");
    constellationNav.dataset.materialActive = constellationNav.matches(".is-open")
      ? "mobile" : "none";
  }
  const quickLinks = document.querySelector(".mobile-index-links");
  if (quickLinks) quickLinks.inert = isConstellationNavOpen || controlConsole.inert;
  if (constellationNavOrbit) {
    constellationNavOrbit.inert = compactConstellationNav.matches && !isConstellationNavOpen;
  }
};

const setConstellationNavOpen = (isOpen) => {
  isConstellationNavOpen = isOpen;
  constellationNav?.classList.toggle("is-open", isOpen);
  constellationNavToggle?.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("has-constellation-nav", isOpen);

  if (constellationNavToggleLabel) {
    constellationNavToggleLabel.textContent = isOpen ? "Закрыть меню" : "Открыть меню";
  }

  syncConstellationNavInteractivity();
};

const setConstellationNavCurrent = (view) => {
  document.querySelectorAll("[data-nav-view], [data-index-route]").forEach((item) => {
    const isCurrent = (item.dataset.navView || item.dataset.indexRoute) === view;
    item.classList.toggle("is-current", isCurrent);

    if (isCurrent) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
};

constellationNavToggle?.addEventListener("click", () => {
  setConstellationNavOpen(!isConstellationNavOpen);
});

document.querySelectorAll("[data-nav-view], [data-nav-utility]").forEach((item) => {
  item.addEventListener("click", () => {
    setConstellationNavOpen(false);
  });
});

compactConstellationNav.addEventListener("change", syncConstellationNavInteractivity);
syncConstellationNavInteractivity();

const contentPanel = document.querySelector("[data-content-panel]");
const panelScrim = document.querySelector("[data-panel-scrim]");
const panelClose = document.querySelector("[data-close-panel]");
const panelTitle = document.querySelector("[data-panel-title]");
const panelIndex = document.querySelector("[data-panel-index]");
const contentPanelBody = document.querySelector(".content-panel__body");
const contentPanelHeader = document.querySelector(".content-panel__header");
const panelMore = document.querySelector(".content-panel__more");
const syncPanelMore = () => {
  const overflow = contentPanelBody.scrollHeight - contentPanelBody.clientHeight;
  panelMore.hidden = overflow <= (panelMore.hidden ? 0 : panelMore.offsetHeight + 8) + 1;
  if (panelMore.hidden) {
    if (document.activeElement === panelMore) contentPanelBody.focus({ preventScroll: true });
    return;
  }
  const end = contentPanelBody.scrollTop + contentPanelBody.clientHeight >= contentPanelBody.scrollHeight - 2;
  panelMore.dataset.direction = end ? "up" : "down";
  panelMore.firstElementChild.textContent = typographUiText(end ? "К началу" : contentPanel.dataset.view === "work" ? "Ещё кейсы" : "Дальше");
};
let moreFrame = 0;
const schedulePanelMore = () => {
  if (moreFrame) return;
  moreFrame = requestAnimationFrame(() => { moreFrame = 0; syncPanelMore(); });
};
const moreResize = new ResizeObserver(schedulePanelMore);
moreResize.observe(contentPanelBody);
moreResize.observe(document.querySelector(".work-section"));
contentPanelBody.addEventListener("scroll", schedulePanelMore, { passive: true });
panelMore.addEventListener("click", () => contentPanelBody.scrollTo({
  top: panelMore.dataset.direction === "up" ? 0
    : contentPanelBody.scrollTop + contentPanelBody.clientHeight * .8,
  behavior: reducedMotion.matches ? "auto" : "smooth",
}));
const placeContentFrame = () => {
  const gap = parseFloat(getComputedStyle(contentPanelHeader).gap) || 12;
  const top = Math.ceil(contentPanelHeader.offsetTop + contentPanelHeader.offsetHeight + gap);
  contentPanel.style.setProperty("--panel-frame-top", `${top}px`);
  syncContactConsoles();
};
new ResizeObserver(placeContentFrame).observe(contentPanelHeader);
new ResizeObserver(placeContentFrame).observe(document.querySelector(".content-panel__frame"));
window.addEventListener("resize", placeContentFrame, { passive: true });
window.addEventListener("author-presence-change", placeContentFrame);
const panelSections = Array.from(document.querySelectorAll("[data-panel-section]"));
// A single static preview belongs to the work link in every input mode.
for (const row of document.querySelectorAll(".work-row[data-map-point]")) {
  const item = mapItems.find(item => item.id === row.dataset.mapPoint);
  if (!item) continue;
  if (item.kind === "project") row.querySelector(".work-row__title").textContent = typographUiText(item.label);
  const poster = getMapPreviewPoster(item);
  if (!poster) {
    const cover = document.createElement("span");
    cover.className = "work-row__preview work-row__preview--type";
    cover.setAttribute("aria-hidden", "true");
    cover.textContent = row.querySelector(".work-row__title").textContent;
    row.prepend(cover);
    continue;
  }
  const image = document.createElement("img");
  image.className = "work-row__preview";
  image.classList.toggle("work-row__preview--logo", item.previewKind === "logo");
  image.src = poster;
  image.alt = "";
  image.width = 900;
  image.height = 600;
  image.loading = "lazy";
  image.decoding = "async";
  row.prepend(image);
}
const panelOpenButtons = Array.from(document.querySelectorAll("[data-open-panel]"));
const controlConsoleHome = document.createComment("control-console-home");

controlConsole?.before(controlConsoleHome);

const panelBackgroundRoots = [
  document.querySelector(".map-hero"),
  document.querySelector(".site-header"),
  ...document.querySelectorAll(".skip-link"),
].filter(Boolean);
const contactConsoleHomes = [".site-header", ".system-dock"].map(selector => {
  const element = document.querySelector(selector);
  const home = document.createComment("contact-console-home");
  element.before(home);
  return { element, home };
});
let activePanelView = null;
let lastPanelTrigger = null;
const panelViews = {
  work: {
    index: "01 / КЕЙСЫ",
    title: "Ключевые кейсы",
  },
  approach: {
    index: "02 / ПОДХОД",
    title: "ПОДХОД",
  },
  contact: {
    index: "03 / СВЯЗАТЬСЯ",
    title: "СВЯЗАТЬСЯ",
  },
};

function syncContactConsoles() {
  let available = activePanelView === "contact"
    && document.body.classList.contains("has-content-panel")
    && !compactConstellationNav.matches
    && !document.body.classList.contains("has-settings-panel");
  if (available) {
    const windows = [contentPanelHeader, document.querySelector(".content-panel__frame")]
      .map(element => element.getBoundingClientRect());
    available = [".site-header", ".map-controls", ".display-control"].every(selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return windows.every(window => box.right + 8 <= window.left || box.left - 8 >= window.right
        || box.bottom + 8 <= window.top || box.top - 8 >= window.bottom);
    });
  }
  if (available === document.body.classList.contains("has-contact-consoles")) return;
  if (!available && contactConsoleHomes.some(({ element }) => element.contains(document.activeElement))) {
    panelClose.focus({ preventScroll: true });
  }
  // Keep visible controls inside the dialog's keyboard scope, above its scrim.
  for (const { element, home } of contactConsoleHomes) {
    if (available) contentPanel.append(element);
    else home.after(element);
  }
  document.body.classList.toggle("has-contact-consoles", available);
  window.dispatchEvent(new CustomEvent("reading-surface-change"));
}
window.addEventListener("pointerup", syncContactConsoles);
document.querySelector(".system-dock").addEventListener("click", event => {
  if (document.body.classList.contains("has-contact-consoles") && event.target.closest(".map-controls button")) {
    closeContentPanel({ restoreFocus: false });
  }
}, true);

const setPanelOpen = (isOpen) => {
  if (isOpen && contentPanel && controlConsole && !contentPanel.contains(controlConsole)) {
    contentPanel.append(controlConsole);
    contentPanel.append(commandResults, commandStatus);
  }

  contentPanel?.classList.toggle("is-open", isOpen);
  contentPanel?.setAttribute("aria-hidden", String(!isOpen));

  if (contentPanel) {
    contentPanel.inert = !isOpen;
  }

  panelBackgroundRoots.forEach((element) => {
    element.inert = isOpen && !contentPanel.contains(element);
  });

  panelScrim?.classList.toggle("is-visible", isOpen);
  panelScrim?.setAttribute("aria-hidden", String(!isOpen));
  panelOpenButtons.forEach((button) => {
    button.setAttribute(
      "aria-expanded",
      String(isOpen && button.dataset.openPanel === activePanelView),
    );
  });
  document.body.classList.toggle("has-content-panel", isOpen);
  syncContactConsoles();
  syncConstellationNavInteractivity();

  if (!isOpen && controlConsole && controlConsoleHome.parentNode) {
    controlConsoleHome.parentNode.insertBefore(controlConsole, controlConsoleHome.nextSibling);
    commandResultsHome.after(commandResults, commandStatus);
  }
};

const openContentPanel = (
  view,
  trigger = null,
  {
    updateHistory = true,
    replaceHistory = false,
    position = null,
  } = {},
) => {
  const config = panelViews[view];

  if (!config) {
    return;
  }
  if (position?.view !== view) position = null;
  contentPanel?.classList.toggle("is-restoring-position", Boolean(position));
  if (observationRoute.active) stopObservation({ updateHistory: false });

  activePanelView = view;
  lastPanelTrigger = trigger instanceof HTMLElement && mapInspector.contains(trigger)
    ? constellationNavItems.find(item => item.dataset.navView === view)
    : trigger instanceof HTMLElement ? trigger
    : position ? panelOpenButtons.find(button => button.dataset.openPanel === view)
      : document.activeElement;
  contentPanel?.setAttribute("data-view", view);
  signalField?.setAttribute("data-camera-view", view);
  setConstellationNavCurrent(view);
  setConstellationNavOpen(false);
  panelSections.forEach((section) => {
    section.hidden = section.dataset.panelSection !== view;
  });
  if (panelTitle) {
    panelTitle.textContent = typographUiText(config.title);
  }

  if (panelIndex) {
    panelIndex.textContent = config.index;
  }

  hideMapPreview({ immediate: true });
  clearMapSelection();
  setPanelOpen(true);
  placeContentFrame();
  syncPanelMore();
  contentPanelBody?.scrollTo({ top: position?.scrollTop || 0, behavior: "auto" });

  if (updateHistory) {
    trackPortfolioEvent("panel_open", {
      panel_id: view,
      source: "navigation",
    });
    writeUrlState(
      {
        point: null,
        route: null,
        step: null,
        hash: `#${view}`,
      },
      { replace: replaceHistory },
    );
    window.history.replaceState({ ...history.state, panelPosition: position }, "", location.href);
  }

  window.requestAnimationFrame(() => {
    placeContentFrame();
    syncPanelMore();
    contentPanelBody?.scrollTo({ top: position?.scrollTop || 0, behavior: "auto" });
    if (document.activeElement?.closest("[data-command-form], [data-command-results]")) return;
    const sourceRow = position?.pointId && contentPanelBody?.querySelector(
      `.work-row[data-map-point="${CSS.escape(position.pointId)}"]`,
    );
    (sourceRow || panelClose)?.focus({ preventScroll: true });
  });
};

const closeContentPanel = (
  {
    restoreFocus = true,
    updateHistory = true,
  } = {},
) => {
  if (!activePanelView) {
    return;
  }

  setPanelOpen(false);
  activePanelView = null;
  contentPanel?.removeAttribute("data-view");
  signalField?.removeAttribute("data-camera-view");
  setConstellationNavCurrent("map");

  if (updateHistory) {
    writeUrlState({ hash: null }, { replace: true });
  }

  if (restoreFocus && lastPanelTrigger instanceof HTMLElement) {
    const triggerIsInCompactNavigation = compactConstellationNav.matches
      && Boolean(lastPanelTrigger.closest("[data-constellation-nav-orbit]"));

    if (triggerIsInCompactNavigation) {
      setConstellationNavOpen(true);
    }

    lastPanelTrigger.focus({ preventScroll: true });
  }
};

const openPointFromContentPanel = (pointId, sourceRow = null) => {
  const origin = activePanelView ? {
    view: activePanelView,
    scrollTop: contentPanelBody?.scrollTop || 0,
    pointId: sourceRow?.dataset.mapPoint || null,
  } : null;
  if (origin) {
    window.history.replaceState({ ...history.state, panelPosition: origin }, "", location.href);
    closeContentPanel({ restoreFocus: false, updateHistory: false });
  }
  setTimeMode(false, { updateHistory: false });
  setMapFilter("all", { updateHistory: false });
  selectMapItem(pointId, { reveal: true, updateHistory: false });
  writeUrlState({ point: pointId, route: null, step: null, view: null, filter: null, hash: "#map" });
  window.history.replaceState({ ...history.state, inspectorPanelOrigin: origin }, "", location.href);
  window.requestAnimationFrame(() => inspectorClose?.focus());
};

setInspectorReturnHandler(() => {
  const step = window.history.state?.inspectorOverviewStep;
  if (Number.isInteger(step)) {
    startObservation({ step, autoplay: false, updateHistory: false });
    return true;
  }
  const origin = window.history.state?.inspectorPanelOrigin;
  if (!origin || !panelViews[origin.view]) return false;
  openContentPanel(origin.view, null, { replaceHistory: true, position: origin });
  return true;
});

document.querySelector("[data-map-link]").addEventListener("click", event => {
  if (!observationRoute.active || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const point = new URL(event.currentTarget.href).searchParams.get("point");
  if (!mapButtons.has(point)) return;
  event.preventDefault();
  const step = observationRoute.step;
  stopObservation({ updateHistory: false });
  selectMapItem(point, { reveal: true });
  history.replaceState({ ...history.state, inspectorOverviewStep: step }, "", location.href);
});

panelOpenButtons.forEach((button) => {
  button.setAttribute("aria-controls", "content-panel");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", (event) => {
    if (button.matches("a") && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    openContentPanel(button.dataset.openPanel, button);
  });
});

contentPanel?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || !activePanelView) {
    return;
  }

  const focusableElements = getTabStops(contentPanel);
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements.at(-1);

  if (!firstFocusable || !lastFocusable) {
    event.preventDefault();
    panelClose?.focus();
    return;
  }

  if (event.shiftKey && document.activeElement === firstFocusable) {
    event.preventDefault();
    lastFocusable.focus();
  } else if (!event.shiftKey && document.activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus();
  }
});

contentPanelBody?.addEventListener("keydown", (event) => {
  scrollRegionFromKey(event, contentPanelBody, reducedMotion.matches);
});

panelClose?.addEventListener("click", () => closeContentPanel());
panelScrim?.addEventListener("click", () => closeContentPanel());

contentPanelBody?.addEventListener("click", (event) => {
  const caseLink = event.target.closest?.(".work-row[data-map-point]");

  if (
    !caseLink
    || event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) {
    return;
  }

  const pointId = caseLink.dataset.mapPoint;

  if (!mapButtons.has(pointId)) {
    return;
  }

  event.preventDefault();
  trackPortfolioEvent("point_open", {
    point_id: pointId,
    source: "cases",
  });
  openPointFromContentPanel(pointId, caseLink);
});

mapInspector?.querySelector("[data-map-related]")?.addEventListener("click", (event) => {
  const link = event.target.closest("a.map-related__item");
  if (!link || event.defaultPrevented || event.button !== 0
    || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const pointId = new URL(link.href, location.href).searchParams.get("point");
  if (!mapButtons.has(pointId)) return;
  event.preventDefault();
  setTimeMode(false, { updateHistory: false });
  setMapFilter("all", { updateHistory: false });
  selectMapItem(pointId, { reveal: true, updateHistory: false });
  writeUrlState({ point: pointId, view: null, filter: null });
  window.requestAnimationFrame(() => mapInspector.querySelector("[data-map-title]")?.focus({ preventScroll: true }));
});

constellationNavHome?.addEventListener("click", () => {
  if (activePanelView) {
    closeContentPanel({ restoreFocus: false });
  }

  setInspectorOpen(false);
  setConstellationNavCurrent("map");
});

const commandForm = document.querySelector("[data-command-form]");
const commandInput = document.querySelector("[data-command-input]");
const commandResults = document.querySelector("[data-command-results]");
const commandStatus = document.querySelector("[data-command-status]");
const commandResultsHome = document.createComment("command-results-home");
commandResults?.before(commandResultsHome);
const commandSubmit = commandForm?.querySelector(".command-dock__submit");
const syncCommandFocusViewport = () => {
  const usesFocusedMobileLayout = compactCommandViewport.matches
    && commandForm?.classList.contains("is-open");

  document.body.classList.toggle(
    "has-command-focus",
    usesFocusedMobileLayout,
  );

  if (!usesFocusedMobileLayout) {
    clearCommandViewportPosition();
  }

  scheduleDetachedCommandResultsPosition();
};
const compactMapFrame = window.matchMedia("(max-width: 900px)");
let mobileMapFrame = 0;
const syncMobileMapFrame = () => {
  window.cancelAnimationFrame(mobileMapFrame);
  mobileMapFrame = window.requestAnimationFrame(() => {
    if (!signalField || !commandForm || commandForm.classList.contains("is-open")) {
      return;
    }

    if (!compactMapFrame.matches) {
      [
        "--mobile-map-reserve",
        "--mobile-map-top",
        "--mobile-map-center-y",
        "--mobile-map-y-scale",
        "--mobile-horizon-top",
        "--mobile-time-scale",
      ].forEach((property) => signalField.style.removeProperty(property));
      return;
    }

    const mapBounds = signalField.getBoundingClientRect();
    const searchBounds = commandForm.getBoundingClientRect();

    if (!mapBounds.height || !searchBounds.height) {
      return;
    }

    /* The lower controls define the actual edge of the usable map. On short
       screens a small part of the optical field may continue behind the
       material, but interactive content stays in the clear stage above it. */
    const shortScreenPressure = Math.max(
      0,
      Math.min(1, (700 - mapBounds.height) / 132),
    );
    const controlClearance = Math.max(0, mapBounds.bottom - searchBounds.top);
    const stageGap = 14;
    const lowerOverscan = 26 * shortScreenPressure;
    const authorBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 48;
    const cameraTop = Math.max(48, authorBottom - mapBounds.top + 14);
    const cameraReserve = Math.max(
      52,
      controlClearance + stageGap - lowerOverscan,
    );
    const cameraCenter = cameraTop
      + (mapBounds.height - cameraReserve - cameraTop) / 2;
    const usableStageHeight = Math.max(
      0,
      searchBounds.top - mapBounds.top - stageGap - cameraTop,
    );
    const stageAspect = usableStageHeight / Math.max(1, mapBounds.width);
    const viewportTallProgress = Math.max(
      0,
      Math.min(1, (stageAspect - 1.35) / 0.45),
    );
    const screenAspect = window.screen.height > window.screen.width
      ? window.screen.height / Math.max(1, window.screen.width)
      : 1;
    const screenTallProgress = Math.max(
      0,
      Math.min(1, (screenAspect - 1.78) / 0.34),
    );
    const tallStageProgress = Math.max(
      viewportTallProgress,
      screenTallProgress,
    );
    const mapYScale = 1 + 0.16 * tallStageProgress;
    const cameraHeight = Math.max(1, mapBounds.height - cameraReserve - cameraTop);
    const horizonTop = Math.min(85 + 8 * tallStageProgress,
      (searchBounds.top - mapBounds.top - cameraTop - 16) / cameraHeight * 100);
    const timeScale = 1.18 - 0.04 * shortScreenPressure;

    signalField.style.setProperty(
      "--mobile-map-reserve",
      `${cameraReserve.toFixed(2)}px`,
    );
    signalField.style.setProperty(
      "--mobile-map-top",
      `${cameraTop.toFixed(2)}px`,
    );
    signalField.style.setProperty(
      "--mobile-map-center-y",
      `${cameraCenter.toFixed(2)}px`,
    );
    signalField.style.setProperty(
      "--mobile-map-y-scale",
      mapYScale.toFixed(3),
    );
    signalField.style.setProperty(
      "--mobile-horizon-top",
      `${horizonTop.toFixed(2)}%`,
    );
    signalField.style.setProperty(
      "--mobile-time-scale",
      timeScale.toFixed(3),
    );
    requestMapLinksRender();
  });
};
const syncCommandPlaceholder = () => {
  if (commandInput) {
    commandInput.placeholder = compactConstellationNav.matches
      ? "Найти…"
      : "Найти или\u00a0открыть…";
  }
};

compactConstellationNav.addEventListener("change", syncCommandPlaceholder);
syncCommandPlaceholder();
compactCommandViewport.addEventListener?.("change", () => {
  syncCommandFocusViewport();
});
compactMapFrame.addEventListener?.("change", syncMobileMapFrame);
window.addEventListener("resize", syncMobileMapFrame, { passive: true });
window.addEventListener("pageshow", syncMobileMapFrame, { passive: true });
window.visualViewport?.addEventListener("resize", syncMobileMapFrame, {
  passive: true,
});
const authorship = document.querySelector(".site-header");
if (authorship) new ResizeObserver(syncMobileMapFrame).observe(authorship);
document.fonts?.ready.then(syncMobileMapFrame);
syncMobileMapFrame();

let currentCommandResults = [];
let activeCommandIndex = -1;

const setCommandStatus = (message = "") => {
  if (!commandStatus) {
    return;
  }

  commandStatus.textContent = message;
  commandStatus.hidden = !message;
  commandStatus.classList.toggle("is-open", Boolean(message));

  if (message) {
    positionDetachedCommandResults();
  }
};

const normalizeSearch = (value) => String(value || "")
  .toLocaleLowerCase("ru")
  .replaceAll("ё", "е")
  .replace(/[^a-zа-я0-9]+/gi, " ")
  .trim();

const tokenizeSearch = (value) => normalizeSearch(value).split(" ").filter(Boolean);
const mapSearchEvidence = JSON.parse(
  document.querySelector("#map-evidence-data")?.textContent || "{}",
);
const getMapItemSearchFields = (item) => {
  const evidence = mapSearchEvidence[item.id] || {};

  return [
    item.label,
    item.mapLabel,
    item.title,
    item.caseStudy?.title,
    item.meta,
    item.kindLabel,
    item.description,
    evidence.task,
    evidence.role,
    evidence.idea,
    evidence.result,
    evidence.feature,
    evidence.details,
    evidence.weather,
    evidence.timePreview,
    evidence.technical,
    evidence.keywords,
  ];
};
const scoreSearchCandidate = ({
  intents = "",
  primary = [],
  fields = [],
}, query) => {
  const tokens = tokenizeSearch(query);
  const haystack = normalizeSearch(fields.join(" "));

  if (!tokens.every((token) => haystack.includes(token))) {
    return -1;
  }

  const intentTokens = tokenizeSearch(intents);
  const normalizedPrimary = primary.map(normalizeSearch);

  if (tokens.every((token) => intentTokens.includes(token))) {
    return 700;
  }
  if (normalizedPrimary.includes(query)) {
    return 600;
  }
  if (normalizedPrimary.some((field) => field.includes(query))) {
    return 500;
  }
  if (normalizedPrimary.some((field) => tokens.every((token) => field.includes(token)))) {
    return 450;
  }

  return haystack.includes(query) ? 400 : 300;
};

const commandViews = [
  {
    type: "action",
    id: "observation",
    title: "РАБОТЫ И ПОДХОД · 3 МИНУТЫ",
    meta: `${observationSteps.length} ОСТАНОВОК / РАБОТЫ И ПОДХОД`,
    intents: "сеанс наблюдения обзор экскурсия маршрут",
    keywords: "сеанс наблюдение маршрут обзор экскурсия 60 секунд минута",
  },
  {
    type: "action",
    id: "time",
    title: "ХРОНОЛОГИЯ",
    meta: "ОПЫТ / 2010—2026 / ГОДОВЫЕ ОРБИТЫ",
    intents: "хронология время таймлайн",
    keywords: "время годы хронология таймлайн орбиты",
  },
  {
    type: "action",
    id: "settings",
    title: "НАСТРОЙКИ САЙТА",
    meta: "ТЕМА / ДВИЖЕНИЕ / КОНТРАСТ / АНАЛИТИКА",
    intents: "настройки сайт экран тема движение контраст аналитика приватность метрика",
    keywords: "светлая темная анимация доступность яндекс вебвизор cookie согласие",
  },
  {
    type: "panel",
    id: "work",
    title: "КЛЮЧЕВЫЕ КЕЙСЫ",
    meta: "8 КЕЙСОВ / 2017—2026",
    intents: "кейсы проекты работы портфолио",
    keywords: "кейсы проекты работы портфолио работодатель результаты вклад задача роль сайты",
  },
  {
    type: "panel",
    id: "approach",
    title: "КАК Я РАБОТАЮ",
    meta: "ИССЛЕДОВАНИЕ → ФОРМА → КООРДИНАЦИЯ → РЕАЛИЗАЦИЯ",
    intents: "подход метод процесс",
    keywords: "подход метод процесс принципы работа approach how",
  },
  {
    type: "panel",
    id: "contact",
    title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
    intents: "связаться контакт почта",
    keywords: "контакт почта написать связаться contact email",
  },
];

const setCommandOpen = (isOpen) => {
  if (isOpen) {
    setCommandStatus("");
    if (compactCommandViewport.matches && isConstellationNavOpen) setConstellationNavOpen(false);
  }

  const hasResults = isOpen && currentCommandResults.length > 0;
  commandForm?.classList.toggle("is-open", isOpen);
  commandResults?.classList.toggle("is-open", hasResults);
  commandInput?.setAttribute("aria-expanded", String(hasResults));
  commandResults?.setAttribute("aria-hidden", String(!hasResults));
  commandSubmit?.setAttribute(
    "aria-label",
    isOpen ? "Закрыть поиск" : "Открыть результат",
  );
  syncCommandFocusViewport();
  if (isOpen) positionDetachedCommandResults();
  else syncMobileMapFrame();

  if (commandResults) {
    commandResults.inert = !hasResults;
  }

  if (!isOpen) {
    setSearchRelationshipPreview(null);
    commandInput?.removeAttribute("aria-activedescendant");
  }
};

const setActiveCommandResult = (index) => {
  const resultButtons = Array.from(commandResults?.querySelectorAll(".command-result") || []);

  if (!currentCommandResults.length || !resultButtons.length) {
    activeCommandIndex = -1;
    setSearchRelationshipPreview(null);
    commandInput?.removeAttribute("aria-activedescendant");
    return;
  }

  activeCommandIndex = (index + currentCommandResults.length) % currentCommandResults.length;

  resultButtons.forEach((button, buttonIndex) => {
    const isActive = buttonIndex === activeCommandIndex;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  const activeButton = resultButtons[activeCommandIndex];

  if (activeButton && commandResults) {
    commandInput?.setAttribute("aria-activedescendant", activeButton.id);
    const buttonTop = activeButton.offsetTop;
    const buttonBottom = buttonTop + activeButton.offsetHeight;
    const visibleTop = commandResults.scrollTop;
    const visibleBottom = visibleTop + commandResults.clientHeight;

    if (buttonTop < visibleTop) {
      commandResults.scrollTop = buttonTop;
    } else if (buttonBottom > visibleBottom) {
      commandResults.scrollTop = buttonBottom - commandResults.clientHeight;
    }
  }

  const activeResult = currentCommandResults[activeCommandIndex];
  setSearchRelationshipPreview(
    activeResult?.type === "node" ? activeResult.id : null,
  );
};

const clearSearchHighlight = () => {
  mapButtons.forEach((button) => button.classList.remove("is-search-miss"));
  syncMapNodeAvailability();
};

const applySearchHighlight = (query) => {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    clearSearchHighlight();
    return;
  }

  mapItems.forEach((item) => {
    mapButtons.get(item.id)?.classList.toggle(
      "is-search-miss",
      scoreSearchCandidate({ fields: getMapItemSearchFields(item) }, normalizedQuery) < 0,
    );
  });

  syncMapNodeAvailability();
  const navigableItems = getNavigableMapItems();

  if (!navigableItems.some((item) => item.id === rovingMapId) && navigableItems[0]) {
    setMapRovingId(navigableItems[0].id);
  }
};

const makeNodeCommandResult = (item) => ({
  type: "node",
  id: item.id,
  title: item.label,
  meta: item.meta,
});

const getCommandResults = (query) => {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    const garage = mapItems.find((item) => item.id === "garage");
    return [
      ...(garage ? [makeNodeCommandResult(garage)] : []),
      ...commandViews,
    ];
  }

  const candidates = [
    ...mapItems.map((item, index) => ({
      result: makeNodeCommandResult(item),
      order: index,
      score: scoreSearchCandidate({
        primary: [item.label, item.mapLabel, item.title],
        fields: getMapItemSearchFields(item),
      }, normalizedQuery),
    })),
    ...commandViews.map((view, index) => ({
      result: view,
      order: mapItems.length + index,
      score: scoreSearchCandidate({
        intents: view.intents,
        primary: [view.title],
        fields: [view.title, view.meta, view.keywords, view.intents],
      }, normalizedQuery),
    })),
  ];

  return candidates
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, 7)
    .map(({ result }) => result);
};

const renderCommandResults = (query = "") => {
  if (!commandResults) {
    return;
  }

  currentCommandResults = getCommandResults(query);
  activeCommandIndex = -1;
  commandInput?.removeAttribute("aria-activedescendant");
  commandResults.replaceChildren();
  setCommandStatus("");

  if (!currentCommandResults.length) {
    setSearchRelationshipPreview(null);
    setCommandOpen(true);
    setCommandStatus("Ничего не\u00a0нашлось — попробуйте другое слово");
    return;
  }

  currentCommandResults.forEach((result) => {
    const button = document.createElement("button");
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const mark = document.createElement("span");

    button.type = "button";
    button.className = "command-result";
    button.id = `command-result-${result.type}-${result.id}`;
    button.tabIndex = -1;
    button.dataset.resultType = result.type;
    button.dataset.resultId = result.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");

    title.textContent = typographUiText(result.title);
    meta.textContent = typographUiText(result.meta);
    mark.className = "command-result__mark";
    mark.classList.add(
      result.type === "node"
        ? "command-result__mark--node"
        : "command-result__mark--panel",
    );
    mark.textContent = "";
    mark.setAttribute("aria-hidden", "true");

    button.append(title, meta, mark);
    commandResults.append(button);
  });

  setActiveCommandResult(0);
  setCommandOpen(true);
};

const runCommandResult = (result) => {
  if (!result) {
    return;
  }

  const hadSearchQuery = Boolean(normalizeSearch(commandInput?.value || ""));

  if (result.type === "node") {
    trackPortfolioEvent("point_open", {
      point_id: result.id,
      source: "search",
    });
    openPointFromContentPanel(result.id);

    if (commandInput) {
      commandInput.value = "";
    }

    clearSearchHighlight();
  } else if (result.type === "panel") {
    openContentPanel(result.id, commandInput);
  } else if (result.id === "observation") {
    closeContentPanel({ restoreFocus: false, updateHistory: false });
    startObservation({ source: "search" });
  } else if (result.id === "time") {
    closeContentPanel({ restoreFocus: false, updateHistory: false });
    setTimeMode(true);
  } else if (result.id === "settings") {
    const settingsQuery = normalizeSearch(commandInput?.value || "");
    let settingsSection = "settings";

    if (settingsQuery.includes("движ")) {
      settingsSection = "motion";
    } else if (settingsQuery.includes("контраст")) {
      settingsSection = "contrast";
    } else if (/аналит|приват|метрик|яндекс|вебвизор|cookie|согласи/.test(settingsQuery)) {
      settingsSection = "analytics";
    }

    openSettingsPanel({
      trigger: commandInput,
      section: settingsSection,
    });
  }

  if (hadSearchQuery) {
    trackPortfolioEvent("search_success", {
      result_id: result.id,
      result_type: result.type,
    });
  }

  setCommandOpen(false);
  commandInput?.blur();
};

commandInput?.addEventListener("focus", () => {
  if (observationRoute.active) stopObservation();
  hideMapPreview({ immediate: true });
  setInspectorOpen(false);
  renderCommandResults(commandInput.value);
});

commandInput?.addEventListener("input", () => {
  applySearchHighlight(commandInput.value);
  renderCommandResults(commandInput.value);
});

commandInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    runCommandResult(
      currentCommandResults[activeCommandIndex]
      || currentCommandResults[0]
      || getCommandResults(commandInput.value)[0],
    );
    return;
  }

  if (!["ArrowDown", "ArrowUp"].includes(event.key)) {
    return;
  }

  event.preventDefault();

  if (!commandForm?.classList.contains("is-open")) {
    renderCommandResults(commandInput.value);
  }

  if (!currentCommandResults.length) {
    return;
  }

  setActiveCommandResult(activeCommandIndex + (event.key === "ArrowDown" ? 1 : -1));
});

commandInput?.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (commandForm?.contains(document.activeElement)) {
      syncCommandFocusViewport();
      return;
    }

    setCommandOpen(false);
    setCommandStatus("");
    syncCommandFocusViewport();
  }, 120);
});

commandSubmit?.addEventListener("click", (event) => {
  if (!commandForm?.classList.contains("is-open")) {
    return;
  }

  event.preventDefault();
  setCommandOpen(false);
  setCommandStatus("");
  commandInput?.blur();
  clearSearchHighlight();
});

commandResults?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
});

commandResults?.addEventListener("pointermove", (event) => {
  const button = event.target.closest(".command-result");

  if (!button) {
    return;
  }

  const resultButtons = Array.from(commandResults.querySelectorAll(".command-result"));
  const resultIndex = resultButtons.indexOf(button);

  if (resultIndex >= 0 && resultIndex !== activeCommandIndex) {
    setActiveCommandResult(resultIndex);
  }
});

commandResults?.addEventListener("click", (event) => {
  const button = event.target.closest(".command-result");

  if (!button) {
    return;
  }

  runCommandResult(currentCommandResults.find((result) => (
    result.type === button.dataset.resultType && result.id === button.dataset.resultId
  )));
});

commandForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runCommandResult(
    currentCommandResults[activeCommandIndex]
    || currentCommandResults[0]
    || getCommandResults(commandInput?.value || "")[0],
  );
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || document.querySelector("[data-settings-panel][open]")) {
    return;
  }

  if (
    document.activeElement === commandInput
    || commandForm?.classList.contains("is-open")
  ) {
    event.preventDefault();
    setCommandOpen(false);
    setCommandStatus("");
    commandInput?.blur();
    // Finish Escape before the next click; blur is delayed.
    syncCommandFocusViewport();
    clearSearchHighlight();
  } else if (isMapPreviewActive()) {
    hideMapPreview({ immediate: true });
  } else if (observationRoute.active) {
    stopObservation();
  } else if (isConstellationNavOpen) {
    setConstellationNavOpen(false);
    constellationNavToggle?.focus();
  } else if (activePanelView) {
    closeContentPanel();
  } else if (mapInspector?.classList.contains("is-open")) {
    inspectorClose?.click();
  } else {
    setCommandOpen(false);
    setCommandStatus("");
    commandInput?.blur();
    clearSearchHighlight();
  }
});

const applyUrlState = () => {
  setApplyingUrlState(true);

  try {
    const url = new URL(window.location.href);
    const panelView = url.hash.slice(1);
    const route = url.searchParams.get("route");
    const pointId = url.searchParams.get("point");
    const requestedFilters = normalizeMapFilters(url.searchParams.get("filter"));
    const requestedTimeMode = url.searchParams.get("view") === "time";

    if (["work", "approach", "contact"].includes(panelView)) {
      if (observationRoute.active) {
        stopObservation({
          updateHistory: false,
          closeInspector: true,
        });
      }

      if (timeModeActive) {
        setTimeMode(false, {
          updateHistory: false,
          restoreFilter: false,
        });
      }

      openContentPanel(panelView, null, {
        updateHistory: false,
        position: window.history.state?.panelPosition,
      });
      return;
    }

    if (activePanelView) {
      closeContentPanel({
        restoreFocus: false,
        updateHistory: false,
      });
    }

    if (route === "observation") {
      const requestedStep = Math.max(
        0,
        Math.min(
          observationSteps.length - 1,
          Number.parseInt(url.searchParams.get("step") || "1", 10) - 1,
        ),
      );

      startObservation({
        step: requestedStep,
        autoplay: false,
        updateHistory: false,
      });
      return;
    }

    if (observationRoute.active) {
      stopObservation({
        updateHistory: false,
        closeInspector: true,
      });
    }

    setTimeMode(requestedTimeMode, {
      updateHistory: false,
      restoreFilter: false,
    });

    const point = mapItems.find((item) => item.id === pointId);
    const pointMatchesFilter = !point
      || requestedFilters.has(point.kind);
    setMapFilter(
      !pointMatchesFilter ? "all" : requestedFilters,
      { updateHistory: false },
    );

    if (point && (!requestedTimeMode || Number.isFinite(point.timeYear))) {
      selectMapItem(point.id, {
        reveal: true,
        updateHistory: false,
      });
    } else {
      clearMapSelection();
    }
  } finally {
    setApplyingUrlState(false);
  }
};

window.addEventListener("popstate", applyUrlState);
applyUrlState();
