// Runtime module 7/9: viewport UI for detached command geometry and draggable desktop consoles.
const compactCommandViewport = window.matchMedia("(max-width: 680px)");
const commandResultsMaximumHeight = 404;
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
  let maximumHeight = Math.min(
    commandResultsMaximumHeight,
    window.innerHeight * 0.57,
  );
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
      Math.min(
        commandResultsMaximumHeight,
        dockTop - viewport.top - gap - edgeGap,
      ),
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

export {
  clearCommandViewportPosition,
  compactCommandViewport,
  getConsoleOffset,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
  setConsoleOffset,
};
