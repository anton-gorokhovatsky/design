// Runtime module 5/9: guided overview timing and controls.
import { trackPortfolioEvent } from "./analytics.js";
import { mapItems } from "./map-data.js";
import { reducedMotion } from "./preferences.js";
import { signalField } from "./signal-field.js";

const observationSteps = [
  {
    id: "origin",
    kind: "МАРШРУТ / 01",
    title: "Обзор работ за 90 секунд",
    meta: "8 ОСТАНОВОК / РАБОТЫ И ПОДХОД",
    description: "Покажу работу в Музее «Гараж», несколько самостоятельных проектов и один из моих принципов. Маршрут можно поставить на паузу или закончить в любой момент.",
    showcaseId: "garage-site",
    x: 50,
    y: 54,
  },
  { id: "garage", itemId: "garage", showcaseId: "garage-site" },
  { id: "narkomfin", itemId: "narkomfin" },
  { id: "private-practice", itemId: "private-practice" },
  { id: "eleven", itemId: "eleven" },
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

const createObservationRoute = ({
  clearMapSelection,
  getSelectedMapId,
  getStepPosition,
  hideMapPreview,
  isTimeModeActive,
  renderShowcase,
  renderSyntheticStep,
  selectMapItem,
  setMapFilter,
  setTimeMode,
  writeUrlState,
}) => {
  const observationStart = document.querySelector("[data-start-observation]");
  const observationControls = document.querySelector("[data-observation-controls]");
  const observationProgress = document.querySelector("[data-observation-progress]");
  const observationPrevious = document.querySelector("[data-observation-previous]");
  const observationPause = document.querySelector("[data-observation-pause]");
  const observationNext = document.querySelector("[data-observation-next]");
  const observationStatus = document.querySelector("[data-observation-status]");
  const stepDuration = 90000 / (observationSteps.length - 1);
  let active = false;
  let paused = false;
  let stepIndex = 0;
  let timer = 0;

  const clearTimer = () => {
    window.clearTimeout(timer);
    timer = 0;
  };

  const setCamera = (step) => {
    const position = getStepPosition(step);
    const cameraX = Math.max(-5.2, Math.min(5.2, (50 - position.x) * 0.12));
    const cameraY = Math.max(-3.6, Math.min(3.6, (54 - position.y) * 0.09));

    signalField?.style.setProperty("--observation-camera-x", `${cameraX}%`);
    signalField?.style.setProperty("--observation-camera-y", `${cameraY}%`);
  };

  const updateControls = () => {
    if (observationProgress) {
      observationProgress.textContent = `${String(stepIndex + 1).padStart(2, "0")} / ${String(observationSteps.length).padStart(2, "0")}`;
    }

    if (observationPrevious) {
      observationPrevious.disabled = stepIndex === 0;
    }

    if (observationPause) {
      observationPause.textContent = paused ? "ПРОДОЛЖИТЬ" : "ПАУЗА";
      observationPause.setAttribute("aria-pressed", String(paused));
    }

    if (observationNext) {
      observationNext.textContent = stepIndex === observationSteps.length - 1
        ? "ЗАВЕРШИТЬ"
        : "ДАЛЬШЕ";
    }

    signalField?.style.setProperty(
      "--observation-route-progress",
      String((stepIndex + 1) / observationSteps.length),
    );
  };

  const scheduleStep = () => {
    clearTimer();

    if (!active || paused) {
      return;
    }

    if (stepIndex >= observationSteps.length - 1) {
      paused = true;
      updateControls();
      return;
    }

    timer = window.setTimeout(() => {
      stepIndex += 1;
      renderStep(stepIndex, { updateHistory: true });
    }, stepDuration);
  };

  function renderStep(index, { updateHistory = true } = {}) {
    if (!active) {
      return;
    }

    stepIndex = Math.max(
      0,
      Math.min(observationSteps.length - 1, Number(index) || 0),
    );
    const step = observationSteps[stepIndex];

    setCamera(step);
    renderShowcase(step);

    if (step.itemId) {
      selectMapItem(step.itemId, {
        reveal: true,
        updateHistory: false,
      });
    } else {
      renderSyntheticStep(step);
    }

    updateControls();

    if (observationStatus) {
      observationStatus.textContent = `Обзор работ: шаг ${stepIndex + 1} из ${observationSteps.length}. ${step.title || mapItems.find((item) => item.id === step.itemId)?.title || ""}`;
    }

    if (updateHistory) {
      writeUrlState(
        {
          point: null,
          route: "observation",
          step: stepIndex + 1,
          view: null,
        },
        { replace: true },
      );
    }

    scheduleStep();
  }

  const stop = (
    {
      updateHistory = true,
      closeInspector = true,
    } = {},
  ) => {
    clearTimer();
    active = false;
    paused = false;
    observationControls?.setAttribute("hidden", "");
    delete signalField?.dataset.observationActive;
    renderShowcase();
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
          point: closeInspector ? null : getSelectedMapId(),
        },
        { replace: true },
      );
    }
  };

  const start = (
    {
      step = 0,
      autoplay = true,
      updateHistory = true,
      source = "direct",
    } = {},
  ) => {
    if (isTimeModeActive()) {
      setTimeMode(false, {
        updateHistory: false,
        restoreFilter: false,
      });
    }

    setMapFilter("all", { updateHistory: false });
    hideMapPreview({ immediate: true });
    active = true;
    paused = !autoplay || reducedMotion.matches;
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

    renderStep(step, { updateHistory: true });
    if (updateHistory) observationPause?.focus({ preventScroll: true });
  };

  observationStart?.addEventListener("click", () => {
    start();
  });

  observationPrevious?.addEventListener("click", () => {
    paused = true;
    renderStep(stepIndex - 1);
  });

  observationPause?.addEventListener("click", () => {
    paused = !paused;
    updateControls();
    scheduleStep();
  });

  observationNext?.addEventListener("click", () => {
    if (stepIndex >= observationSteps.length - 1) {
      trackPortfolioEvent("observation_complete", { source: "route" });
      stop();
      return;
    }

    renderStep(stepIndex + 1);
  });

  reducedMotion.addEventListener?.("change", () => {
    if (!reducedMotion.matches || !active || paused) {
      return;
    }

    paused = true;
    clearTimer();
    updateControls();
  });

  document.addEventListener("keydown", (event) => {
    if (
      !active
      || event.defaultPrevented
      || event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement
      || event.target?.isContentEditable
    ) {
      return;
    }

    if (event.key === "ArrowLeft" && stepIndex > 0) {
      event.preventDefault();
      paused = true;
      renderStep(stepIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();

      if (stepIndex >= observationSteps.length - 1) {
        stop();
      } else {
        renderStep(stepIndex + 1);
      }
    }
  });

  return {
    get active() {
      return active;
    },
    start,
    steps: observationSteps,
    stop,
  };
};

export { createObservationRoute, observationSteps };
