// Runtime module 7/9: viewport UI for detached command geometry and draggable desktop consoles.
// Both ordinary panels and expanded cases use the same focused reading keys.
// This changes keyboard input only; scrolling still belongs to the native region.
const scrollRegionFromKey = (event, region, reduceMotion) => {
  if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  const maximum = region.scrollHeight - region.clientHeight;
  const step = event.key.startsWith("Page") ? region.clientHeight * 0.82 : 48;
  const top = event.key === "Home" ? 0 : event.key === "End" ? maximum
    : region.scrollTop + (["ArrowDown", "PageDown"].includes(event.key) ? step : -step);
  event.preventDefault();
  region.scrollTo({ top: Math.max(0, Math.min(maximum, top)), behavior: reduceMotion ? "auto" : "smooth" });
};

// The paper and its contents are separate layers. Only the paper's visible
// ends bend; native text geometry, selection and pointer targets never warp.
const scrollSurfaces = new Map();
const restoreScrollSurface = (surface) => {
  const state = scrollSurfaces.get(surface);
  if (!state) return;
  state.paper.remove();
  state.resize.unobserve(surface);
  requestAnimationFrame(() => {
    if (!scrollSurfaces.has(surface)) surface.classList.remove("scroll-surface");
  });
  delete surface.dataset.scrollSurface;
  surface.dataset.materialSurface = state.name;
  surface.dataset.materialActive = state.mode;
  surface.style.position = state.position;
  Object.assign(surface.style, state.paint);
  for (const [child, mask] of state.masks) child.style.maskImage = mask;
  scrollSurfaces.delete(surface);
};
const clearScrollSurfaces = (owner) => {
  for (const surface of scrollSurfaces.keys()) {
    if (owner.contains(surface)) restoreScrollSurface(surface);
  }
};
const observeScrollSurfaces = (region, owner = region) => {
  if (!region) return;
  let frame = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const forced = matchMedia("(forced-colors: active)");
  const update = () => {
    frame = 0;
    if (region.matches(".map-inspector.is-case-view")) return;
    const bounds = region.getBoundingClientRect();
    const disabled = reduced.matches || forced.matches
      || document.documentElement.dataset.reduceMotion === "true"
      // Compact sections already preserve whole corners with their sticky stack.
      || (region.matches(".content-panel__body") && matchMedia("(max-width: 680px)").matches)
      || !bounds.height || getComputedStyle(region).visibility === "hidden"
      || region.scrollHeight <= region.clientHeight + 1;
    if (disabled) {
      clearScrollSurfaces(region);
      return;
    }
    const surfaces = region.querySelectorAll("[data-material-surface], [data-scroll-surface]");
    for (const surface of surfaces) {
      if (surface.hasAttribute("data-scroll-backdrop") || surface.matches("button, .map-readout__kind")
        || surface.closest("[data-scroll-surface]") !== (surface.hasAttribute("data-scroll-surface") ? surface : null)) continue;
      const rect = surface.getBoundingClientRect();
      const scale = rect.height / surface.offsetHeight || 1;
      const top = Math.max(0, bounds.top - rect.top) / scale;
      const bottom = Math.max(0, rect.bottom - bounds.bottom) / scale;
      const visible = surface.offsetHeight - top - bottom;
      if (visible < 2 || (!top && !bottom) || surface.classList.contains("is-content-stack-hidden")) {
        restoreScrollSurface(surface);
        continue;
      }
      let state = scrollSurfaces.get(surface);
      if (state && !state.paper.isConnected) {
        restoreScrollSurface(surface);
        state = null;
      }
      if (!state) {
        const style = getComputedStyle(surface);
        if (style.backgroundColor === "rgba(0, 0, 0, 0)") continue;
        const paper = document.createElement("span");
        paper.dataset.scrollBackdrop = "";
        paper.setAttribute("aria-hidden", "true");
        state = { paper, resize, masks: new Map(), name: surface.dataset.materialSurface,
          mode: surface.dataset.materialActive, position: surface.style.position,
          paint: { background: surface.style.background, backdropFilter: surface.style.backdropFilter,
            webkitBackdropFilter: surface.style.webkitBackdropFilter },
          radius: parseFloat(style.borderTopLeftRadius) || 24 };
        paper.dataset.materialSurface = state.name;
        paper.dataset.materialActive = state.mode;
        surface.dataset.scrollSurface = state.name;
        surface.removeAttribute("data-material-surface");
        surface.removeAttribute("data-material-active");
        surface.classList.add("scroll-surface");
        Object.assign(surface.style, { background: "transparent", backdropFilter: "none", webkitBackdropFilter: "none" });
        if (style.position === "static") surface.style.position = "relative";
        surface.prepend(paper);
        scrollSurfaces.set(surface, state);
        resize.observe(surface);
      }
      const strength = (cut) => Math.min(1, cut / 72);
      const radius = Math.min(state.radius, surface.offsetWidth / 2, visible / 2);
      const end = (cut) => Math.min(visible / 2, radius + (Math.min(96, surface.offsetWidth * .24) - radius) * strength(cut));
      const across = Math.min(surface.offsetWidth / 2, radius + 14 * Math.max(strength(top), strength(bottom)));
      Object.assign(state.paper.style, {
        top: `${top}px`, bottom: `${bottom}px`,
        borderRadius: `${across}px / ${end(top)}px ${end(top)}px ${end(bottom)}px ${end(bottom)}px`,
      });
      for (const child of surface.children) {
        if (child === state.paper) continue;
        const r = child.getBoundingClientRect();
        const start = Math.max(0, bounds.top - r.top) / scale;
        const finish = Math.min(child.offsetHeight, (bounds.bottom - r.top) / scale);
        if (!state.masks.has(child)) state.masks.set(child, child.style.maskImage);
        if (start <= 0 && finish >= child.offsetHeight) {
          child.style.maskImage = state.masks.get(child);
          continue;
        }
        const fade = Math.min(24, child.offsetHeight / 3);
        child.style.maskImage = `linear-gradient(to bottom, transparent ${start}px, #000 ${start + (start > 0 ? fade : 0)}px, #000 ${finish - (finish < child.offsetHeight ? fade : 0)}px, transparent ${finish}px)`;
      }
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  region.addEventListener("scroll", schedule, { passive: true });
  owner.addEventListener("animationend", schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  new MutationObserver(schedule).observe(owner, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "hidden", "data-selected-map-id"],
  });
  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-reduce-motion"],
  });
  reduced.addEventListener("change", schedule);
  forced.addEventListener("change", schedule);
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
};

observeScrollSurfaces(document.querySelector(".content-panel__body"), document.querySelector(".content-panel"));
observeScrollSurfaces(document.querySelector("[data-map-inspector]"));

// Keep a short continuation cue inside text lists without reshaping cards.
const observeScrollEdges = (region, { owner = region } = {}) => {
  if (!region) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const active = region.clientHeight > 0 && region.scrollHeight > region.clientHeight + 1;
    const top = active ? Math.max(0, region.scrollTop) : 0;
    const bottom = active ? Math.max(0, region.scrollHeight - region.clientHeight - top) : 0;
    region.style.setProperty("--scroll-fade-top", Math.min(14, top) + "px");
    region.style.setProperty("--scroll-fade-bottom", Math.min(14, bottom) + "px");
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  region.addEventListener("scroll", schedule, { passive: true });
  region.addEventListener("focusin", schedule);
  owner.addEventListener("animationend", schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  const contents = new MutationObserver(() => {
    for (const child of region.children) resize.observe(child);
    schedule();
  });
  contents.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(schedule).observe(owner, {
    attributes: true, attributeFilter: ["class", "open", "hidden"],
  });
  for (const child of region.children) resize.observe(child);
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
};

observeScrollEdges(document.querySelector(".settings-panel__body"), {
  owner: document.querySelector("[data-settings-panel]"),
});
observeScrollEdges(document.querySelector("[data-command-results]"));
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
const setCommandGeometry = (element, group, values) => {
  for (const [name, value] of Object.entries(values)) {
    element.style.setProperty(
      `--command-${group}-${name}`,
      typeof value === "number" ? value.toFixed(2) + "px" : value,
    );
  }
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

  const compact = compactCommandViewport.matches;
  const bounds = dock.getBoundingClientRect();
  const surface = compact ? dock : dock.closest("[data-floating-console]") || dock;
  const surfaceBounds = surface.getBoundingClientRect();
  const viewport = getCommandVisualViewport();
  const gap = 8;
  const edgeGap = 8;
  const focusedMobile = compact && dock.contains(document.activeElement);
  let anchorTop = surfaceBounds.top;
  let anchorBottom = surfaceBounds.bottom;
  // Align with the search segment's left edge and the console material's right edge.
  let width = Math.min(
    surfaceBounds.right - bounds.left,
    Math.max(0, viewport.width - edgeGap * 2),
  );
  let left = Math.max(
    viewport.left + edgeGap,
    Math.min(bounds.left, viewport.left + viewport.width - edgeGap - width),
  );

  if (focusedMobile) {
    anchorTop = Math.max(
      viewport.top + edgeGap,
      viewport.top + viewport.height - bounds.height - edgeGap,
    );
    anchorBottom = anchorTop + bounds.height;
    left = viewport.left + edgeGap;
    width = Math.max(0, viewport.width - edgeGap * 2);
    setCommandGeometry(document.documentElement, "focus", { left, top: anchorTop, width });
  } else {
    clearCommandViewportPosition();
  }

  const spaceAbove = Math.max(0, anchorTop - viewport.top - gap - edgeGap);
  const spaceBelow = Math.max(
    0,
    viewport.top + viewport.height - anchorBottom - gap - edgeGap,
  );

  [results, status].filter(Boolean).forEach((element) => {
    setCommandGeometry(element, "results", { left, width });

    const contentHeight = element.scrollHeight;
    // Keep the familiar placement above when it fits; otherwise use the
    // roomier side. Only the actual visible viewport may constrain the list.
    const opensBelow = !focusedMobile
      && contentHeight > spaceAbove
      && spaceBelow > spaceAbove;
    const maximumHeight = opensBelow ? spaceBelow : spaceAbove;
    element.dataset.placement = opensBelow ? "below" : "above";
    setCommandGeometry(element, "results", {
      "max-height": maximumHeight,
      top: opensBelow
        ? anchorBottom + gap
        : focusedMobile
          ? anchorTop - gap - Math.min(maximumHeight, contentHeight)
          : "auto",
      bottom: opensBelow || focusedMobile
        ? "auto"
        : window.innerHeight - anchorTop + gap,
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

  scheduleDetachedCommandResultsPosition();
};

let consoleResizeFrame = 0;
window.addEventListener("resize", () => {
  window.cancelAnimationFrame(consoleResizeFrame);
  consoleResizeFrame = window.requestAnimationFrame(syncFloatingConsoleBounds);
});
floatingConsoleMedia.addEventListener?.("change", syncFloatingConsoleBounds);

export {
  clearScrollSurfaces,
  observeScrollSurfaces,
  observeScrollEdges,
  scrollRegionFromKey,
  clearCommandViewportPosition,
  compactCommandViewport,
  getConsoleOffset,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
  setConsoleOffset,
};
