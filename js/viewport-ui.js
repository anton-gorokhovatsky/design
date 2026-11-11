import {pane} from './pane-viewport.js';

const scrollRegionFromKey = (event, region, reduceMotion) => {
  if (event.target.matches("input, select, textarea") || !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  const maximum = region.scrollHeight - region.clientHeight;
  const step = event.key.startsWith("Page") ? region.clientHeight * 0.82 : 48;
  const top = event.key === "Home" ? 0 : event.key === "End" ? maximum
    : region.scrollTop + (["ArrowDown", "PageDown"].includes(event.key) ? step : -step);
  event.preventDefault();
  region.scrollTo({ top: Math.max(0, Math.min(maximum, top)), behavior: reduceMotion ? "auto" : "smooth" });
};

const compactCommandViewport = pane.media("(max-width: 900px)");
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
const setCommandGeometry = (element, group, values) => {
  for (const [name, value] of Object.entries(values)) {
    element.style.setProperty(
      `--command-${group}-${name}`,
      typeof value === "number" ? value.toFixed(2) + "px" : value,
    );
  }
};
const getCommandVisualViewport = () => {
  const viewport = pane.visualViewport;

  return {
    height: viewport?.height || pane.height,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || pane.width,
  };
};
const positionDetachedCommandResults = () => {
  const dock = document.querySelector("[data-command-form]");
  const results = document.querySelector("[data-command-results]");
  const status = document.querySelector("[data-command-status]");

  if (!dock || !results) return;

  const compact = compactCommandViewport.matches;
  const focusedMobile = compact && dock.classList.contains("is-open");
  for (const element of [dock, results, status].filter(Boolean)) {
    const visible = focusedMobile && !element.hidden && (element === dock || element.classList.contains("is-open"));
    if (visible && element.showPopover) {
      element.setAttribute("popover", "manual");
      if (!element.matches(":popover-open")) element.showPopover();
    } else if (element.hasAttribute("popover")) {
      if (element.matches(":popover-open")) element.hidePopover();
      element.removeAttribute("popover");
    }
  }
  const bounds = dock.getBoundingClientRect();
  const surface = compact ? dock : dock.closest("[data-floating-console]") || dock;
  const surfaceBounds = surface.getBoundingClientRect();
  const viewport = getCommandVisualViewport();
  if (focusedMobile) {
    const visual = window.visualViewport;
    const map = document.getElementById("map-pane").getBoundingClientRect();
    viewport.left = Math.max(visual?.offsetLeft || 0, map.left);
    viewport.width = Math.max(0, Math.min((visual?.offsetLeft || 0) + (visual?.width || innerWidth), map.right) - viewport.left);
    const frameInset = parseFloat(getComputedStyle(document.getElementById("split-shell")).paddingBottom) || 0;
    viewport.height = Math.max(0, Math.min(viewport.top + (visual?.height || innerHeight), innerHeight - frameInset) - viewport.top);
  }
  const gap = 8;
  let anchorTop = surfaceBounds.top;
  let anchorBottom = surfaceBounds.bottom;
  const resultWidth = compact ? surfaceBounds.right - bounds.left
    : Math.max(surfaceBounds.right - bounds.left, Math.min(surfaceBounds.width, 640));
  let width = Math.min(resultWidth, Math.max(0, viewport.width - gap * 2));
  let left = Math.max(viewport.left + gap,
    Math.min(surfaceBounds.right - width, viewport.left + viewport.width - gap - width));

  if (focusedMobile) {
    anchorTop = Math.max(viewport.top + gap, viewport.top + viewport.height - bounds.height - gap);
    anchorBottom = anchorTop + bounds.height;
    left = viewport.left + gap;
    width = Math.max(0, viewport.width - gap * 2);
    setCommandGeometry(document.documentElement, "focus", { left, top: anchorTop, width });
    anchorTop = dock.getBoundingClientRect().top;
    anchorBottom = anchorTop + bounds.height;
  } else {
    clearCommandViewportPosition();
  }

  const spaceAbove = Math.max(0, anchorTop - viewport.top - gap * 2);
  const spaceBelow = Math.max(0, viewport.top + viewport.height - anchorBottom - gap * 2);

  [results, status].filter(Boolean).forEach((element) => {
    setCommandGeometry(element, "results", { left, width });

    const contentHeight = element.scrollHeight;
    const opensBelow = !focusedMobile && (contentHeight > spaceAbove && spaceBelow > spaceAbove);
    let maxHeight = opensBelow ? spaceBelow : spaceAbove;
    const peek = [...element.children].map(row => row.offsetTop + row.offsetHeight / 2)
      .filter(height => height <= maxHeight).at(-1);
    if (contentHeight > maxHeight && peek) maxHeight = peek;
    element.dataset.placement = opensBelow ? "below" : "above";
    setCommandGeometry(element, "results", {
      "max-height": maxHeight,
      top: opensBelow
        ? anchorBottom + gap
        : focusedMobile
          ? anchorTop - gap - Math.min(maxHeight, contentHeight)
          : "auto",
      bottom: opensBelow || focusedMobile
        ? "auto"
        : pane.height - anchorTop + gap,
    });
  });
};
let commandPositionFrame = 0;
const scheduleDetachedCommandResultsPosition = () => {
  window.cancelAnimationFrame(commandPositionFrame);
  commandPositionFrame = window.requestAnimationFrame(
    positionDetachedCommandResults,
  );
};

pane.visualViewport?.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
pane.visualViewport?.addEventListener(
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
  "(min-width: 901px) and (hover: hover) and (pointer: fine)",
);
const consoleInteractiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "form",
  "[data-console-text]",
  "[contenteditable='true']",
].join(",");

const getConsoleOffset = (module) => ({
  x: Number.parseFloat(module.dataset.dragX || "0") || 0,
  y: Number.parseFloat(module.dataset.dragY || "0") || 0,
});

const authorCard = document.querySelector('.site-header');
const authorField = document.querySelector('.whoop-field');
const syncCompactControlGeometry = () => {
  const close = document.querySelector('#story-pane [data-close-story]');
  if (pane.width > 900) {
    close?.style.removeProperty('--control-target');
    document.querySelector('#story-pane')?.style.removeProperty('--story-close-inset');
    return;
  }
  const toggle = document.querySelector('[data-constellation-nav-toggle]');
  const mark = toggle?.querySelector('.constellation-nav__cluster');
  const map = document.querySelector('.map-surface');
  if (!toggle || !mark || !map || toggle.getAttribute('aria-expanded') === 'true') return;
  const button = toggle.getBoundingClientRect();
  const icon = mark.getBoundingClientRect();
  if (!button.width || !icon.width) return;
  const write = (element, name, value) => {
    const next = `${value.toFixed(2)}px`;
    if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
  };
  write(map, '--compact-menu-bottom', button.bottom - map.getBoundingClientRect().top);
  const name = authorCard?.querySelector('.brand__name');
  if (name) write(authorCard, '--author-menu-text-width', Math.max(0, button.left - name.getBoundingClientRect().left));
  const inspector = document.querySelector('.map-inspector.has-reading-frame:not(.is-case-view).is-open');
  const inspectorClose = inspector?.querySelector('[data-close-inspector]');
  if (inspectorClose) write(inspector, '--compact-inspector-axis-padding', Math.max(0,
    inspector.getBoundingClientRect().right - icon.left - icon.width / 2 - inspectorClose.getBoundingClientRect().width / 2));
  const story = document.querySelector('#story-pane');
  if (story && document.body.classList.contains('has-story-pane')) {
    const right = story.getBoundingClientRect().left + story.clientLeft + story.clientWidth;
    const centre = icon.left + icon.width / 2;
    close?.style.removeProperty('--control-target');
    const target = Math.max(44, Math.min(close?.getBoundingClientRect().width || button.width, (right - centre) * 2));
    if (close && innerWidth < 1000) write(close, '--control-target', target);
    write(story, '--story-close-inset', right - centre - target / 2);
  }
};
let compactGeometryFrame = 0;
const compactGeometryResize = new ResizeObserver(() => {
  if (!compactGeometryFrame) compactGeometryFrame = requestAnimationFrame(() => { compactGeometryFrame = 0; syncCompactControlGeometry(); });
});
document.querySelectorAll('[data-constellation-nav-toggle], #story-pane').forEach(element => compactGeometryResize.observe(element));
const syncAuthorField = () => {
  if (!authorCard || !authorField) return;
  const card = authorCard.getBoundingClientRect();
  const map = authorField.parentElement.getBoundingClientRect();
  authorField.style.cssText = `left:${card.left-map.left-112}px;top:${card.top-map.top-96}px;width:${card.width+208}px;height:${card.height+192}px`;
};
const syncAuthorPresence = () => {
  if (!authorCard) return;
  const reading = document.body.classList.contains("has-content-panel")
    || document.body.classList.contains("has-settings-panel")
    || Boolean(document.querySelector(".map-inspector.is-open"));
  document.body.classList.toggle("has-reading-surface", reading);
  authorCard.inert = (reading && !document.body.classList.contains("has-contact-consoles"))
    || document.body.matches(".has-constellation-nav, .has-command-focus");
  syncAuthorField();
  syncCompactControlGeometry();
  window.dispatchEvent(new CustomEvent("author-presence-change"));
};
let authorPresenceFrame = 0;
if (authorCard) new ResizeObserver(() => {
  if (authorPresenceFrame) return;
  authorPresenceFrame = requestAnimationFrame(() => { authorPresenceFrame = 0; syncAuthorPresence(); });
}).observe(authorCard);
window.addEventListener("reading-surface-change", syncAuthorPresence);
new MutationObserver(syncAuthorPresence).observe(document.body, { attributes: true, attributeFilter: ["class"] });
const authorInspector = document.querySelector(".map-inspector");
if (authorInspector) new MutationObserver(syncAuthorPresence).observe(authorInspector, { attributes: true, attributeFilter: ["class"] });
syncAuthorPresence();

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
  if (module.classList.contains("control-console")) {
    const { top, height } = module.getBoundingClientRect();
    document.documentElement.style.setProperty("--console-clearance", `${height ? pane.height - top + y : 0}px`);
  }
  if (module === authorCard) syncAuthorField();
};

const clampConsoleOffset = (module, desiredX, desiredY, basePosition = null) => {
  const margin = 8;
  const currentOffset = getConsoleOffset(module);
  const rect = module.getBoundingClientRect();
  const baseLeft = basePosition?.left ?? rect.left - currentOffset.x;
  const baseTop = basePosition?.top ?? rect.top - currentOffset.y;
  const minimumX = margin - baseLeft;
  const maximumX = pane.width - margin - baseLeft - rect.width;
  const minimumY = margin - baseTop;
  const maximumY = pane.height - margin - baseTop - rect.height;

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
      scheduleDetachedCommandResultsPosition();
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

const syncConsoleBounds = () => {
  syncCompactControlGeometry();
  if (!floatingConsoleMedia.matches) {
    floatingConsoleModules.forEach((module) => setConsoleOffset(module, 0, 0));
    return;
  }

  const navigation = document.querySelector(".control-console");
  if (navigation?.getClientRects().length && pane.width > 900) {
    const offset = getConsoleOffset(navigation);
    setConsoleOffset(navigation, offset.x, offset.y);
  }

  floatingConsoleModules.forEach((module) => {
    const rect = module.getBoundingClientRect();
    if (!rect.width || !rect.height || pane.width <= 900) return;
    const currentOffset = getConsoleOffset(module);
    const nextOffset = clampConsoleOffset(module, currentOffset.x, currentOffset.y);
    setConsoleOffset(module, nextOffset.x, nextOffset.y);
  });

  scheduleDetachedCommandResultsPosition();
};

const consoleResize = new ResizeObserver(() => requestAnimationFrame(syncConsoleBounds));
floatingConsoleModules.forEach(module => consoleResize.observe(module));
window.addEventListener("resize", syncConsoleBounds);
floatingConsoleMedia.addEventListener?.("change", syncConsoleBounds);

export {
  scrollRegionFromKey,
  clearCommandViewportPosition,
  compactCommandViewport,
  getConsoleOffset,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
  setConsoleOffset,
};
