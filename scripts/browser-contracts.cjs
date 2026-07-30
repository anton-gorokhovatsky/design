"use strict";

const mobileSearchViewport = {
  width: 390,
  height: 430,
  screenWidth: 390,
  screenHeight: 844,
};

const mobileMetricViewport = {
  width: 390,
  height: 844,
};

const openMobileSearchExpression = `(() => {
  const input = document.querySelector("[data-command-input]");
  input?.focus({ preventScroll: true });
  if (input) {
    input.value = "";
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward",
    }));
  }
  return true;
})()`;

const readMobileSearchFocusedExpression = `(() => {
  const rect = (selector) => {
    const bounds = document.querySelector(selector)?.getBoundingClientRect();
    return bounds ? {
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    } : null;
  };
  const withinViewport = (bounds) => (
    bounds
    && bounds.top >= -1
    && bounds.left >= -1
    && bounds.right <= innerWidth + 1
    && bounds.bottom <= innerHeight + 1
  );
  const input = document.querySelector("[data-command-input]");
  const results = document.querySelector("[data-command-results]");
  const dockBounds = rect("[data-command-form]");
  const resultsBounds = rect("[data-command-results]");
  return {
    focused: document.activeElement === input,
    bodyHasFocus: document.body.classList.contains("has-command-focus"),
    expanded: input?.getAttribute("aria-expanded"),
    count: results?.children.length || 0,
    dock: dockBounds,
    results: resultsBounds,
    geometryFits: withinViewport(dockBounds)
      && withinViewport(resultsBounds)
      && resultsBounds.bottom <= dockBounds.top - 6,
    resultsClientHeight: results?.clientHeight || 0,
    resultsScrollHeight: results?.scrollHeight || 0,
    pageScrollY: window.scrollY,
    overflowX: document.documentElement.scrollWidth
      - document.documentElement.clientWidth,
    systemDockVisibility: getComputedStyle(
      document.querySelector(".system-dock"),
    ).visibility,
    navigationVisibility: getComputedStyle(
      document.querySelector("[data-constellation-nav]"),
    ).visibility,
  };
})()`;

const dispatchMobileSearchKeyExpression = (key) => `(() => {
  const input = document.querySelector("[data-command-input]");
  input?.dispatchEvent(new KeyboardEvent("keydown", {
    bubbles: true,
    key: ${JSON.stringify(key)},
  }));
  return true;
})()`;

const readMobileSearchArrowExpression = `(() => ({
  activeId: document.querySelector("[data-command-input]")
    ?.getAttribute("aria-activedescendant"),
  pageScrollY: window.scrollY,
  resultsScrollTop: document.querySelector("[data-command-results]")
    ?.scrollTop || 0,
}))()`;

const readMobileSearchRestoredExpression = `(() => ({
  focused: document.activeElement?.matches?.("[data-command-input]") || false,
  bodyHasFocus: document.body.classList.contains("has-command-focus"),
  expanded: document.querySelector("[data-command-input]")
    ?.getAttribute("aria-expanded"),
  pageScrollY: window.scrollY,
  systemDockVisibility: getComputedStyle(
    document.querySelector(".system-dock"),
  ).visibility,
  navigationVisibility: getComputedStyle(
    document.querySelector("[data-constellation-nav]"),
  ).visibility,
}))()`;

const readMobileMetricGroupsExpression = `(() => {
  const element = document.querySelector("[data-map-evidence-result]");
  const value = element?.textContent || "";
  const measure = (fragment) => {
    const node = element?.firstChild;
    const start = value.indexOf(fragment);
    if (!node || start < 0) {
      return null;
    }
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + fragment.length);
    const rects = Array.from(range.getClientRects());
    return {
      rectCount: rects.length,
      lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
    };
  };
  return {
    has51: value.includes("51\\u00a0420"),
    has67: value.includes("67\\u00a0893"),
    group51: measure("51\\u00a0420"),
    group67: measure("67\\u00a0893"),
  };
})()`;

const validateMobileSearchContract = ({
  arrow,
  focused,
  restored,
}) => {
  const failures = [];

  if (
    !focused.focused
    || !focused.bodyHasFocus
    || focused.expanded !== "true"
    || focused.count !== 7
    || !focused.geometryFits
    || focused.pageScrollY !== 0
    || focused.overflowX !== 0
    || focused.systemDockVisibility !== "hidden"
    || focused.navigationVisibility !== "hidden"
  ) {
    failures.push({
      id: "focused-state",
      message: "focused search does not fit the keyboard-sized viewport",
      details: focused,
    });
  }

  if (
    arrow.activeId !== "command-result-panel-contact"
    || arrow.pageScrollY !== 0
    || arrow.resultsScrollTop <= 0
  ) {
    failures.push({
      id: "option-scroll",
      message: "option navigation pans the page instead of the result list",
      details: arrow,
    });
  }

  if (
    restored.focused
    || restored.bodyHasFocus
    || restored.expanded !== "false"
    || restored.pageScrollY !== 0
    || restored.systemDockVisibility !== "visible"
    || restored.navigationVisibility !== "visible"
  ) {
    failures.push({
      id: "escape-restore",
      message: "Escape does not restore the map controls",
      details: restored,
    });
  }

  return failures;
};

const validateMobileMetricGroups = (metricGroups) => {
  if (
    metricGroups.has51
    && metricGroups.has67
    && metricGroups.group51?.lines === 1
    && metricGroups.group67?.lines === 1
  ) {
    return [];
  }

  return [{
    id: "metric-wrap",
    message: "Narkomfin metrics split inside thousands-separated numbers",
    details: metricGroups,
  }];
};

module.exports = {
  dispatchMobileSearchKeyExpression,
  mobileMetricViewport,
  mobileSearchViewport,
  openMobileSearchExpression,
  readMobileMetricGroupsExpression,
  readMobileSearchArrowExpression,
  readMobileSearchFocusedExpression,
  readMobileSearchRestoredExpression,
  validateMobileMetricGroups,
  validateMobileSearchContract,
};
