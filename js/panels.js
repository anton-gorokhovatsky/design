// Runtime module 8/9: content panels, search, navigation, and URL state.
import {
  openSettingsPanel,
  trackPortfolioEvent,
} from "./analytics.js";
import { mapItems } from "./map-data.js";
import {
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
} from "./map-engine.js";
import {
  reducedMotion,
  typographUiText,
} from "./preferences.js";
import { signalField } from "./signal-field.js";

import {
  clearCommandViewportPosition,
  compactCommandViewport,
  getConsoleOffset,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
  setConsoleOffset,
} from "./viewport-ui.js";

const constellationNav = document.querySelector("[data-constellation-nav]");
const constellationNavToggle = document.querySelector("[data-constellation-nav-toggle]");
const constellationNavToggleLabel = document.querySelector("[data-constellation-nav-toggle-label]");
const constellationNavOrbit = document.querySelector("[data-constellation-nav-orbit]");
const constellationNavItems = Array.from(document.querySelectorAll("[data-nav-view]"));
const constellationNavUtilities = Array.from(document.querySelectorAll("[data-nav-utility]"));
const constellationNavHome = document.querySelector('[data-nav-view="map"]');
const compactConstellationNav = window.matchMedia("(max-width: 680px)");
let isConstellationNavOpen = false;

const syncConstellationNavInteractivity = () => {
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
    constellationNavToggleLabel.textContent = isOpen ? "Закрыть навигацию" : "Открыть навигацию";
  }

  syncConstellationNavInteractivity();
};

const setConstellationNavCurrent = (view) => {
  constellationNavItems.forEach((item) => {
    const isCurrent = item.dataset.navView === view;
    item.classList.toggle("is-current", isCurrent);

    if (isCurrent) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
};

constellationNavToggle?.addEventListener("click", () => {
  if (
    compactConstellationNav.matches
    && document.querySelector("[data-command-form]")?.classList.contains("is-open")
  ) {
    setCommandOpen(false);
    setCommandStatus("");
    commandInput?.blur();
    clearSearchHighlight();
    return;
  }

  setConstellationNavOpen(!isConstellationNavOpen);
});

constellationNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    setConstellationNavOpen(false);
  });
});
constellationNavUtilities.forEach((item) => {
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
const panelSections = Array.from(document.querySelectorAll("[data-panel-section]"));
const panelOpenButtons = Array.from(document.querySelectorAll("[data-open-panel]"));
const controlConsole = document.querySelector(".control-console");
const controlConsoleHome = document.createComment("control-console-home");
let controlConsolePanelOffset = null;

controlConsole?.before(controlConsoleHome);

const panelBackgroundRoots = [
  document.querySelector(".map-hero"),
  document.querySelector(".site-header"),
  ...document.querySelectorAll(".skip-link"),
].filter(Boolean);
let activePanelView = null;
let lastPanelTrigger = null;
const compactContentStack = window.matchMedia("(max-width: 680px)");
const contentStackGroups = {
  work: [
    document.querySelector(".work-intro"),
    ...document.querySelectorAll(".work-list .work-row"),
  ].filter(Boolean),
  approach: [
    document.querySelector(".approach-intro"),
    ...document.querySelectorAll(".approach-grid li"),
  ].filter(Boolean),
};
let contentStackFrame = 0;
let contentStackOffsets = [];

const clearContentStackState = () => {
  Object.values(contentStackGroups).flat().forEach((surface) => {
    surface.classList.remove(
      "is-content-stack-active",
      "is-content-stack-behind",
      "is-content-stack-hidden",
    );
    surface.style.removeProperty("--content-stack-order");
  });
};

const measureContentStackOffsets = (surfaces) => {
  if (!contentPanel || !contentPanelBody) {
    return [];
  }

  const scrollTop = contentPanelBody.scrollTop;
  contentPanel.classList.add("is-measuring-content-stack");
  const bodyRect = contentPanelBody.getBoundingClientRect();
  const measurements = surfaces.map((surface) => {
    const rect = surface.getBoundingClientRect();
    return {
      height: rect.height,
      offset: rect.top - bodyRect.top + scrollTop,
    };
  });
  contentPanel.classList.remove("is-measuring-content-stack");
  if (Math.abs(contentPanelBody.scrollTop - scrollTop) > 0.5) {
    contentPanelBody.scrollTo({ top: scrollTop, behavior: "auto" });
  }

  return measurements.map(({ offset }) => offset);
};

const syncContentStack = () => {
  contentStackFrame = 0;

  if (!compactContentStack.matches || !activePanelView) {
    clearContentStackState();
    return;
  }

  const surfaces = contentStackGroups[activePanelView] || [];

  if (contentStackOffsets.length !== surfaces.length) {
    contentStackOffsets = measureContentStackOffsets(surfaces);
  }

  const stackLead = 10;
  let activeIndex = 0;

  for (let index = 1; index < contentStackOffsets.length; index += 1) {
    const nextTop = contentStackOffsets[index] - contentPanelBody.scrollTop;
    const nextStackTop = Number.parseFloat(
      getComputedStyle(surfaces[index]).getPropertyValue("--content-stack-top"),
    ) || 8;

    if (nextTop <= nextStackTop + stackLead) {
      activeIndex = index;
    } else {
      break;
    }
  }

  surfaces.forEach((surface, index) => {
    const layer = activeIndex - index;
    const isActive = index === activeIndex;
    const isBehind = layer > 0 && layer <= 2;
    const isHidden = layer > 2;

    surface.classList.toggle("is-content-stack-active", isActive);
    surface.classList.toggle("is-content-stack-behind", isBehind);
    surface.classList.toggle("is-content-stack-hidden", isHidden);
    surface.style.setProperty("--content-stack-order", String(index));
  });
};

const scheduleContentStackSync = () => {
  if (contentStackFrame) {
    return;
  }

  contentStackFrame = window.requestAnimationFrame(syncContentStack);
};

const invalidateContentStack = () => {
  contentStackOffsets = [];
  scheduleContentStackSync();
};

const panelViews = {
  work: {
    index: "01 / КЕЙСЫ",
    title: "КЛЮЧЕВЫЕ КЕЙСЫ",
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

const setPanelOpen = (isOpen) => {
  if (isOpen && contentPanel && controlConsole && !contentPanel.contains(controlConsole)) {
    controlConsolePanelOffset = getConsoleOffset(controlConsole);
    setConsoleOffset(controlConsole, 0, 0);
    contentPanel.append(controlConsole);
  }

  contentPanel?.classList.toggle("is-open", isOpen);
  contentPanel?.setAttribute("aria-hidden", String(!isOpen));

  if (contentPanel) {
    contentPanel.inert = !isOpen;
  }

  panelBackgroundRoots.forEach((element) => {
    element.inert = isOpen;
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

  if (!isOpen && controlConsole && controlConsoleHome.parentNode) {
    controlConsoleHome.parentNode.insertBefore(controlConsole, controlConsoleHome.nextSibling);

    if (controlConsolePanelOffset) {
      setConsoleOffset(
        controlConsole,
        controlConsolePanelOffset.x,
        controlConsolePanelOffset.y,
      );
      controlConsolePanelOffset = null;
    }
  }
};

const openContentPanel = (
  view,
  trigger = null,
  {
    updateHistory = true,
    replaceHistory = false,
  } = {},
) => {
  const config = panelViews[view];

  if (!config) {
    return;
  }

  activePanelView = view;
  contentStackOffsets = [];
  lastPanelTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
  contentPanel?.setAttribute("data-view", view);
  signalField?.setAttribute("data-camera-view", view);
  setConstellationNavCurrent(view);
  setConstellationNavOpen(false);
  panelSections.forEach((section) => {
    section.hidden = section.dataset.panelSection !== view;
  });
  contentPanelBody?.scrollTo({ top: 0, behavior: "auto" });

  if (panelTitle) {
    panelTitle.textContent = typographUiText(config.title);
  }

  if (panelIndex) {
    panelIndex.textContent = config.index;
  }

  hideMapPreview({ immediate: true });
  clearMapSelection();
  setPanelOpen(true);

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
  }

  window.requestAnimationFrame(() => {
    scheduleContentStackSync();
    panelClose?.focus();
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
  clearContentStackState();
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

panelOpenButtons.forEach((button) => {
  button.setAttribute("aria-controls", "content-panel");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", () => {
    openContentPanel(button.dataset.openPanel, button);
  });
});

contentPanel?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || !activePanelView) {
    return;
  }

  const focusableElements = Array.from(contentPanel.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => (
    !element.hidden
    && !element.closest("[hidden]")
    && !element.closest("[inert]")
    && element.getClientRects().length > 0
  ));
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
  if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const maximumScroll = contentPanelBody.scrollHeight - contentPanelBody.clientHeight;
  const step = event.key.startsWith("Page")
    ? contentPanelBody.clientHeight * 0.82
    : 48;
  let nextScroll = contentPanelBody.scrollTop;

  if (event.key === "Home") {
    nextScroll = 0;
  } else if (event.key === "End") {
    nextScroll = maximumScroll;
  } else {
    nextScroll += ["ArrowDown", "PageDown"].includes(event.key) ? step : -step;
  }

  event.preventDefault();
  contentPanelBody.scrollTo({
    top: Math.max(0, Math.min(maximumScroll, nextScroll)),
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
});

panelClose?.addEventListener("click", () => closeContentPanel());
panelScrim?.addEventListener("click", () => closeContentPanel());
contentPanelBody?.addEventListener("scroll", scheduleContentStackSync, { passive: true });

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
  closeContentPanel({ restoreFocus: false });
  setMapFilter("all");
  trackPortfolioEvent("point_open", {
    point_id: pointId,
    source: "cases",
  });
  selectMapItem(pointId, { reveal: true });
  writeUrlState({ hash: "#map" }, { replace: true });
  window.requestAnimationFrame(() => inspectorClose?.focus());
});

if (typeof compactContentStack.addEventListener === "function") {
  compactContentStack.addEventListener("change", invalidateContentStack);
} else {
  compactContentStack.addListener(invalidateContentStack);
}

window.addEventListener("resize", invalidateContentStack, { passive: true });
window.addEventListener("pageshow", invalidateContentStack, { passive: true });
window.visualViewport?.addEventListener("resize", invalidateContentStack, { passive: true });
document.fonts?.ready.then(invalidateContentStack);

contentPanelBody?.addEventListener("focusin", (event) => {
  if (!compactContentStack.matches) {
    return;
  }

  const focusedCard = event.target.closest(".work-row");

  if (!focusedCard) {
    return;
  }

  focusedCard.scrollIntoView({
    block: "start",
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
  scheduleContentStackSync();
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
const commandSubmit = commandForm?.querySelector(".command-dock__submit");
const syncCompactCommandDismiss = (isOpen) => {
  const usesNavigationToggle = Boolean(
    isOpen && compactCommandViewport.matches,
  );

  if (usesNavigationToggle && isConstellationNavOpen) {
    setConstellationNavOpen(false);
  }

  constellationNav?.classList.toggle(
    "is-command-close",
    usesNavigationToggle,
  );

  if (constellationNavToggle) {
    constellationNavToggle.setAttribute(
      "aria-controls",
      usesNavigationToggle ? "command-results" : "constellation-nav-orbit",
    );

    if (usesNavigationToggle) {
      constellationNavToggle.removeAttribute("aria-expanded");
    } else {
      constellationNavToggle.setAttribute(
        "aria-expanded",
        String(isConstellationNavOpen),
      );
    }
  }

  if (constellationNavToggleLabel) {
    constellationNavToggleLabel.textContent = usesNavigationToggle
      ? "Закрыть поиск"
      : isConstellationNavOpen
        ? "Закрыть навигацию"
        : "Открыть навигацию";
  }
};
const syncCommandFocusViewport = () => {
  const usesFocusedMobileLayout = compactCommandViewport.matches
    && document.activeElement === commandInput;

  document.body.classList.toggle(
    "has-command-focus",
    usesFocusedMobileLayout,
  );

  if (!usesFocusedMobileLayout) {
    clearCommandViewportPosition();
  }

  scheduleDetachedCommandResultsPosition();
};
const compactMapFrame = window.matchMedia("(max-width: 680px)");
let mobileMapFrame = 0;
const syncMobileMapFrame = () => {
  window.cancelAnimationFrame(mobileMapFrame);
  mobileMapFrame = window.requestAnimationFrame(() => {
    if (!signalField || !commandForm) {
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
    const cameraTop = -(18 + 10 * shortScreenPressure);
    const cameraReserve = Math.max(
      52,
      controlClearance + stageGap - lowerOverscan,
    );
    const cameraCenter = cameraTop
      + (mapBounds.height - cameraReserve - cameraTop) / 2;
    const usableStageHeight = Math.max(
      0,
      searchBounds.top - mapBounds.top - stageGap,
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
    const horizonTop = 85 + 8 * tallStageProgress;
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
  syncCompactCommandDismiss(
    commandForm?.classList.contains("is-open"),
  );
});
compactMapFrame.addEventListener?.("change", syncMobileMapFrame);
window.addEventListener("resize", syncMobileMapFrame, { passive: true });
window.addEventListener("pageshow", syncMobileMapFrame, { passive: true });
window.visualViewport?.addEventListener("resize", syncMobileMapFrame, {
  passive: true,
});
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
    item.meta,
    item.kindLabel,
    item.description,
    evidence.task,
    evidence.role,
    evidence.result,
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
    title: "СЕАНС НАБЛЮДЕНИЯ",
    meta: "ОКОЛО 60 СЕКУНД / 8 КООРДИНАТ",
    intents: "сеанс наблюдения обзор экскурсия маршрут",
    keywords: "сеанс наблюдение маршрут обзор экскурсия 60 секунд",
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
    meta: "ТЕМА / ДВИЖЕНИЕ / КОНТРАСТ",
    intents: "настройки сайт экран тема движение контраст",
    keywords: "светлая темная анимация доступность",
  },
  {
    type: "action",
    id: "analytics-settings",
    title: "АНАЛИТИКА И\u00a0ПРИВАТНОСТЬ",
    meta: "ЯНДЕКС МЕТРИКА",
    intents: "аналитика приватность метрика",
    keywords: "вебвизор cookie согласие",
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
    positionDetachedCommandResults();
  }

  commandForm?.classList.toggle("is-open", isOpen);
  commandResults?.classList.toggle("is-open", isOpen);
  commandInput?.setAttribute("aria-expanded", String(isOpen));
  commandResults?.setAttribute("aria-hidden", String(!isOpen));
  commandSubmit?.setAttribute(
    "aria-label",
    isOpen ? "Закрыть поиск" : "Выполнить запрос",
  );
  syncCompactCommandDismiss(isOpen);

  if (commandResults) {
    commandResults.inert = !isOpen;
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
    setCommandOpen(false);
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
    setMapFilter("all");
    trackPortfolioEvent("point_open", {
      point_id: result.id,
      source: "search",
    });
    selectMapItem(result.id, { reveal: true });
    window.requestAnimationFrame(() => inspectorClose?.focus());

    if (commandInput) {
      commandInput.value = "";
    }

    clearSearchHighlight();
  } else if (result.type === "panel") {
    openContentPanel(result.id, commandInput);
  } else if (result.id === "observation") {
    startObservation({ source: "search" });
  } else if (result.id === "time") {
    setTimeMode(true);
  } else if (result.id === "settings") {
    const settingsQuery = normalizeSearch(commandInput?.value || "");
    let settingsSection = "settings";

    if (settingsQuery.includes("движ")) {
      settingsSection = "motion";
    } else if (settingsQuery.includes("контраст")) {
      settingsSection = "contrast";
    }

    openSettingsPanel({
      trigger: commandInput,
      section: settingsSection,
    });
  } else if (result.id === "analytics-settings") {
    openSettingsPanel({
      trigger: commandInput,
      section: "analytics",
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
  syncCommandFocusViewport();
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
  if (event.key !== "Escape") {
    return;
  }

  if (
    document.activeElement === commandInput
    || commandForm?.classList.contains("is-open")
  ) {
    setCommandOpen(false);
    setCommandStatus("");
    commandInput?.blur();
    clearSearchHighlight();
  } else if (activePreviewItem || mapPreview?.classList.contains("is-visible")) {
    hideMapPreview({ immediate: true });
  } else if (observationRoute.active) {
    stopObservation();
  } else if (isConstellationNavOpen) {
    setConstellationNavOpen(false);
    constellationNavToggle?.focus();
  } else if (activePanelView) {
    closeContentPanel();
  } else if (mapInspector?.classList.contains("is-open")) {
    const selectedButton = mapButtons.get(selectedMapId);
    clearMapSelection({ updateHistory: true });
    selectedButton?.focus();
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
