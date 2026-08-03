// Runtime module 6/7: movable consoles, content panels, search, and URL state.
import {
  openAnalyticsConsent,
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
  observationActive,
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

const compactCommandViewport = window.matchMedia("(max-width: 680px)");
const commandViewportProperties = [
  "--command-focus-left",
  "--command-focus-top",
  "--command-focus-width",
];
const clearCommandViewportPosition = () => {
  commandViewportProperties.forEach((property) => {
    document.documentElement.style.removeProperty(property);
  });
};
const getCommandVisualViewport = () => {
  const viewport = window.visualViewport;

  return {
    height: viewport?.height || window.innerHeight,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth,
  };
};
const positionDetachedCommandResults = () => {
  const dock = document.querySelector("[data-command-form]");
  const results = document.querySelector("[data-command-results]");
  const status = document.querySelector("[data-command-status]");

  if (!dock || !results) {
    return;
  }

  const bounds = dock.getBoundingClientRect();
  const gap = compactCommandViewport.matches ? 8 : 19;
  const inputFocused = dock.contains(document.activeElement);
  const usesFocusedMobileLayout = compactCommandViewport.matches && inputFocused;
  let left = bounds.left;
  let width = bounds.width;
  let bottom = window.innerHeight - bounds.top + gap;
  let maximumHeight = Math.min(390, window.innerHeight * 0.54);
  let focusedViewport = null;
  let focusedDockTop = 0;
  let focusedEdgeGap = 0;

  if (usesFocusedMobileLayout) {
    const viewport = getCommandVisualViewport();
    const edgeGap = 8;
    const dockTop = Math.max(
      viewport.top + edgeGap,
      viewport.top + viewport.height - bounds.height - edgeGap,
    );

    left = viewport.left + edgeGap;
    width = Math.max(0, viewport.width - edgeGap * 2);
    bottom = window.innerHeight - dockTop + gap;
    focusedViewport = viewport;
    focusedDockTop = dockTop;
    focusedEdgeGap = edgeGap;
    maximumHeight = Math.max(
      88,
      Math.min(390, dockTop - viewport.top - gap - edgeGap),
    );
    document.documentElement.style.setProperty(
      "--command-focus-left",
      `${left.toFixed(2)}px`,
    );
    document.documentElement.style.setProperty(
      "--command-focus-top",
      `${dockTop.toFixed(2)}px`,
    );
    document.documentElement.style.setProperty(
      "--command-focus-width",
      `${width.toFixed(2)}px`,
    );
  } else {
    clearCommandViewportPosition();
  }

  [results, status].filter(Boolean).forEach((element) => {
    element.style.setProperty("--command-results-left", `${left.toFixed(2)}px`);
    element.style.setProperty("--command-results-width", `${width.toFixed(2)}px`);
    element.style.setProperty(
      "--command-results-bottom",
      `${bottom.toFixed(2)}px`,
    );
    element.style.setProperty(
      "--command-results-max-height",
      `${maximumHeight.toFixed(2)}px`,
    );

    if (focusedViewport) {
      const elementHeight = Math.min(
        maximumHeight,
        Math.max(
          element.scrollHeight,
          element.getBoundingClientRect().height,
        ),
      );
      const top = Math.max(
        focusedViewport.top + focusedEdgeGap,
        focusedDockTop - gap - elementHeight,
      );

      element.style.setProperty(
        "--command-results-top",
        `${top.toFixed(2)}px`,
      );
    } else {
      element.style.removeProperty("--command-results-top");
    }
  });
};
let commandPositionFrame = 0;
const scheduleDetachedCommandResultsPosition = () => {
  window.cancelAnimationFrame(commandPositionFrame);
  commandPositionFrame = window.requestAnimationFrame(
    positionDetachedCommandResults,
  );
};

window.visualViewport?.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
window.visualViewport?.addEventListener(
  "scroll",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
window.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);

const floatingConsoleModules = Array.from(document.querySelectorAll("[data-floating-console]"));
const floatingConsoleMedia = window.matchMedia(
  "(min-width: 681px) and (hover: hover) and (pointer: fine)",
);
const consoleInteractiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "form",
  "[contenteditable='true']",
].join(",");

const getConsoleOffset = (module) => ({
  x: Number.parseFloat(module.dataset.dragX || "0") || 0,
  y: Number.parseFloat(module.dataset.dragY || "0") || 0,
});

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
};

const clampConsoleOffset = (module, desiredX, desiredY, basePosition = null) => {
  const margin = 8;
  const currentOffset = getConsoleOffset(module);
  const rect = module.getBoundingClientRect();
  const baseLeft = basePosition?.left ?? rect.left - currentOffset.x;
  const baseTop = basePosition?.top ?? rect.top - currentOffset.y;
  const minimumX = margin - baseLeft;
  const maximumX = window.innerWidth - margin - baseLeft - rect.width;
  const minimumY = margin - baseTop;
  const maximumY = window.innerHeight - margin - baseTop - rect.height;

  return {
    x: Math.min(Math.max(desiredX, minimumX), Math.max(minimumX, maximumX)),
    y: Math.min(Math.max(desiredY, minimumY), Math.max(minimumY, maximumY)),
  };
};

floatingConsoleModules.forEach((module) => {
  module.addEventListener("pointerdown", (event) => {
    if (
      !floatingConsoleMedia.matches
      || event.button !== 0
      || event.target.closest(consoleInteractiveSelector)
    ) {
      return;
    }

    const startOffset = getConsoleOffset(module);
    const startRect = module.getBoundingClientRect();
    const basePosition = {
      left: startRect.left - startOffset.x,
      top: startRect.top - startOffset.y,
    };
    const startPointer = { x: event.clientX, y: event.clientY };
    let hasFinished = false;

    const finishDrag = (finishEvent) => {
      if (hasFinished || finishEvent.pointerId !== event.pointerId) {
        return;
      }

      hasFinished = true;
      module.classList.remove("is-dragging");
      module.removeEventListener("pointermove", moveModule);
      module.removeEventListener("pointerup", finishDrag);
      module.removeEventListener("pointercancel", finishDrag);
      module.removeEventListener("lostpointercapture", finishDrag);

      if (module.hasPointerCapture?.(event.pointerId)) {
        module.releasePointerCapture(event.pointerId);
      }
    };

    const moveModule = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return;
      }

      const nextOffset = clampConsoleOffset(
        module,
        startOffset.x + moveEvent.clientX - startPointer.x,
        startOffset.y + moveEvent.clientY - startPointer.y,
        basePosition,
      );

      moveEvent.preventDefault();
      setConsoleOffset(module, nextOffset.x, nextOffset.y);
      positionDetachedCommandResults();
    };

    event.preventDefault();
    module.classList.add("is-dragging");
    module.addEventListener("pointermove", moveModule);
    module.addEventListener("pointerup", finishDrag);
    module.addEventListener("pointercancel", finishDrag);
    module.addEventListener("lostpointercapture", finishDrag);
    module.setPointerCapture?.(event.pointerId);
  });
});

const syncFloatingConsoleBounds = () => {
  if (!floatingConsoleMedia.matches) {
    floatingConsoleModules.forEach((module) => setConsoleOffset(module, 0, 0));
    return;
  }

  floatingConsoleModules.forEach((module) => {
    const currentOffset = getConsoleOffset(module);
    const nextOffset = clampConsoleOffset(module, currentOffset.x, currentOffset.y);
    setConsoleOffset(module, nextOffset.x, nextOffset.y);
  });

  positionDetachedCommandResults();
};

let consoleResizeFrame = 0;
window.addEventListener("resize", () => {
  window.cancelAnimationFrame(consoleResizeFrame);
  consoleResizeFrame = window.requestAnimationFrame(syncFloatingConsoleBounds);
});
floatingConsoleMedia.addEventListener?.("change", syncFloatingConsoleBounds);

const constellationNav = document.querySelector("[data-constellation-nav]");
const constellationNavToggle = document.querySelector("[data-constellation-nav-toggle]");
const constellationNavToggleLabel = document.querySelector("[data-constellation-nav-toggle-label]");
const constellationNavOrbit = document.querySelector("[data-constellation-nav-orbit]");
const constellationNavItems = Array.from(document.querySelectorAll("[data-nav-view]"));
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
  setConstellationNavOpen(!isConstellationNavOpen);
});

constellationNavItems.forEach((item) => {
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
    index: "01 / ПРОЕКТЫ",
    title: "ПРОЕКТЫ",
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
compactCommandViewport.addEventListener?.("change", syncCommandFocusViewport);
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

const normalizeSearch = (value) => value
  .toLocaleLowerCase("ru")
  .replaceAll("ё", "е")
  .replace(/[^a-zа-я0-9]+/gi, " ")
  .trim();

const commandViews = [
  {
    type: "action",
    id: "observation",
    title: "СЕАНС НАБЛЮДЕНИЯ",
    meta: "ОКОЛО 60 СЕКУНД / 8 КООРДИНАТ",
    keywords: "сеанс наблюдение маршрут обзор экскурсия 60 секунд",
  },
  {
    type: "action",
    id: "time",
    title: "ХРОНОЛОГИЯ",
    meta: "ОПЫТ / 2009—2026 / ГОДОВЫЕ ОРБИТЫ",
    keywords: "время годы хронология таймлайн орбиты",
  },
  {
    type: "action",
    id: "analytics",
    title: "НАСТРОЙКИ АНАЛИТИКИ",
    meta: "ЯНДЕКС МЕТРИКА / ТОЛЬКО ПО СОГЛАСИЮ",
    keywords: "аналитика приватность privacy метрика вебвизор cookie настройки",
  },
  {
    type: "panel",
    id: "work",
    title: "НЕДАВНИЕ ПРОЕКТЫ",
    meta: "8 ПРОЕКТОВ / 2023—2026",
    keywords: "проекты работы портфолио недавние последние текущие сайты",
  },
  {
    type: "panel",
    id: "approach",
    title: "КАК Я РАБОТАЮ",
    meta: "ИССЛЕДОВАНИЕ → ФОРМА → КООРДИНАЦИЯ → РЕАЛИЗАЦИЯ",
    keywords: "подход метод процесс принципы работа approach how",
  },
  {
    type: "panel",
    id: "contact",
    title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
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
    const haystack = normalizeSearch([
      item.label,
      item.title,
      item.meta,
      item.kindLabel,
      item.description,
    ].join(" "));
    mapButtons.get(item.id)?.classList.toggle("is-search-miss", !haystack.includes(normalizedQuery));
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

  const nodes = mapItems
    .filter((item) => normalizeSearch([
      item.label,
      item.title,
      item.meta,
      item.kindLabel,
      item.description,
    ].join(" ")).includes(normalizedQuery))
    .slice(0, 6)
    .map(makeNodeCommandResult);

  const views = commandViews.filter((view) => (
    normalizeSearch(`${view.title} ${view.meta} ${view.keywords}`).includes(normalizedQuery)
  ));

  return [...nodes, ...views].slice(0, 7);
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
  } else if (result.id === "analytics") {
    openAnalyticsConsent();
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
    setCommandOpen(false);
    setCommandStatus("");
    syncCommandFocusViewport();
  }, 120);
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
  } else if (observationActive) {
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
      if (observationActive) {
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

    if (observationActive) {
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
