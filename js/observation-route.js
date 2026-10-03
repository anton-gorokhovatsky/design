// Runtime module 5/9: guided overview timing and controls.
import { trackPortfolioEvent } from "./analytics.js";
import { mapItems } from "./map-data.js";
import { reducedMotion } from "./preferences.js";
import { signalField } from "./signal-field.js";

const observationSteps = [
  { id: "garage", itemId: "garage", showcaseId: "garage-site", duration: 14000,
    description: "Почти четыре года развивал цифровые проекты Музея «Гараж»: от исследований и интерфейсов до координации разработки и релизов. Сайт музея — часть этой работы; его стратегию и дизайн создала Charmer Studio." },
  { id: "collection", itemId: "collection", duration: 12000,
    description: "Каталог помогает знакомиться с коллекцией: переходить от произведений к авторам и готовиться к посещению открытого хранения. Моя роль — продуктовая логика, исследования, интерфейс и координация реализации." },
  { id: "museum-app", itemId: "garage-app", duration: 12000,
    description: "«Я иду в музей» помогает людям с ментальными особенностями и их близким подготовиться к посещению. При перезапуске приложения исследовал и проектировал маршруты к путеводителям, материалам о доступности и играм." },
  { id: "care", title: "ЦИФРОВАЯ ЗАБОТА", itemId: "principle-experiment", showcaseId: "garage-app", duration: 8000,
    description: "Для меня цифровое гостеприимство — внимание к человеку ещё до первого визита. Понятный маршрут и возможность заранее познакомиться с местом помогают чувствовать себя увереннее." },
  { id: "narkomfin", itemId: "narkomfin", duration: 14000,
    description: "Архитектурный замысел Дома Наркомфина стал основой сайта. Интерактивная модель приглашает исследовать здание: подниматься на крышу, находить кафе и книжный, смотреть на дом при дневном и ночном свете." },
  { id: "eleven", itemId: "eleven", duration: 14000,
    scenes: [[0.2, 3.5], [7.8, 18.5]],
    description: "Велопроект Виктора Доронина — 11 111 км за 31 день. Сайт связывает дневник подготовки и приглашение партнёров, а свет, тени и палитра откликаются на время и погоду в Дубае." },
  { id: "intuition", itemId: "principle-data-intuition", showcaseId: "eleven", duration: 8000,
    description: "Данные помогают понимать происходящее, а интуиция — придумывать опыт. В «11 111» погодные данные становятся светом и атмосферой, которые можно почувствовать." },
  { id: "shirokostup", itemId: "shirokostup", duration: 12000,
    description: "Кураторская практика, тексты и архив Ольги Широкоступ получают собственный редакционный ритм. Сайт и инфраструктуру подготовили так, чтобы дальше она могла вести его сама." },
  { id: "tarski", itemId: "tarski", duration: 10000,
    scenes: [[0.2, 4.2], [6.4, 12.4]],
    description: "Первая концептуальная версия сайта молодой культурной институции Tarski. Программа, редакционные материалы и сеть участников знакомят с её направлением; сайт будет расти вместе с институцией." },
  { id: "krainiuk", itemId: "krainiuk", duration: 16000,
    scenes: [[4.1, 7.9], [10, 14.8], [22.3, 29.7]],
    description: "На сайте тренера Екатерины Крайнюк можно выбрать направление, узнать о тренировках и результатах спортсменов. А «Карты на старт» добавляют игру: открываешь дисциплину, формат старта и знак на финише." },
  { id: "engineering", itemId: "principle-design-engineering", showcaseId: "krainiuk", duration: 8000,
    description: "Сам проектирую интерфейс и пишу код: чувствую и композицию, и технические ограничения. Рабочее взаимодействие, как этот расклад карт, позволяет сразу проверить идею в деле." },
  { id: "ks-fish", itemId: "ks-fish", duration: 14000,
    description: "Рыбная лавка капитана Селёдкина знакомит с Олегом Гугунавой ещё до первого визита. Его фотографии и рассказы живут в «Судовом журнале», а каталог помогает найти рыбу, узнать цену и перейти к заказу." },
  { id: "goal", itemId: "principle-goal", showcaseId: "ks-fish", duration: 8000,
    description: "Начинаю с того, что нужно людям и самому проекту. В лавке важно сохранить голос владельца и помочь выбрать рыбу. Инструменты и устройство сайта подчиняются этой задаче." },
  {
    id: "contact", kind: "ФИНАЛ / 14", title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
    description: "Если вам близок такой подход — напишите мне. Буду рад познакомиться, обсудить идею и вместе найти для неё форму.",
    href: "mailto:anton@gorokhovatsky.tech", x: 50, y: 54,
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
  setShowcasePaused,
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
  let active = false;
  let paused = false;
  let stepIndex = 0;
  let timer = 0;
  let deadline = 0;
  let remaining = observationSteps[0].duration;

  const clearTimer = () => {
    if (timer) remaining = Math.max(0, deadline - performance.now());
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
    setShowcasePaused(paused || document.hidden);
    const isLastStep = stepIndex === observationSteps.length - 1;
    if (observationProgress) {
      observationProgress.textContent = `${String(stepIndex + 1).padStart(2, "0")} / ${String(observationSteps.length).padStart(2, "0")}`;
    }

    if (observationPrevious) {
      observationPrevious.disabled = stepIndex === 0;
    }

    if (observationPause) {
      if (isLastStep && document.activeElement === observationPause) observationNext?.focus();
      observationPause.hidden = isLastStep;
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
    setShowcasePaused(paused || document.hidden);

    if (!active || paused || document.hidden) {
      return;
    }

    if (stepIndex >= observationSteps.length - 1) {
      paused = true;
      updateControls();
      return;
    }

    deadline = performance.now() + remaining;
    timer = window.setTimeout(() => {
      timer = 0;
      renderStep(stepIndex + 1, { updateHistory: true });
    }, remaining);
  };

  function renderStep(index, { updateHistory = true } = {}) {
    if (!active) {
      return;
    }

    clearTimer();
    stepIndex = Math.max(
      0,
      Math.min(observationSteps.length - 1, Number(index) || 0),
    );
    const step = observationSteps[stepIndex];
    remaining = step.duration || 0;

    setCamera(step);
    renderShowcase(step);

    if (step.itemId) {
      selectMapItem(step.itemId, {
        reveal: true,
        updateHistory: false,
        overview: step,
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
          hash: "#map",
        },
      );
    }

    renderStep(step, { updateHistory: true });
    if (updateHistory) (observationPause?.hidden ? observationNext : observationPause)?.focus({ preventScroll: true });
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

  document.addEventListener("visibilitychange", () => {
    if (active) scheduleStep();
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
