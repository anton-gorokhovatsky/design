import { trackPortfolioEvent } from "./analytics.js";
import { mapItems } from "./map-data.js";
import { reducedMotion } from "./preferences.js";
import { signalField } from "./signal-field.js";

const observationSteps = [
  { id: "garage", itemId: "garage", showcaseId: "garage-site", duration: 16000,
    description: "Почти четыре года развивал цифровые проекты Музея «Гараж»: исследования, интерфейсы, координация разработки и релизов. Стратегию и дизайн сайта создала Charmer Studio." },
  { id: "collection", itemId: "collection", duration: 14000,
    description: "Из произведения — к автору, из каталога — в открытое хранение. Помогал связать знакомство с коллекцией и визит в музей: продуктовая логика, исследования, интерфейс и координация реализации." },
  { id: "museum-app", itemId: "garage-app", duration: 14000,
    description: "Подготовиться к визиту людям с ментальными особенностями и их близким помогает «Я иду в музей». При перезапуске исследовал и проектировал маршруты к путеводителям, материалам о доступности и играм." },
  { id: "care", title: "ЦИФРОВАЯ ЗАБОТА", kind: "ПОДХОД", meta: "", itemId: "principle-experiment", showcaseId: "garage-care", duration: 18000,
    description: "Забота начинается до визита. Исследование сенсорной карты «Гаража» описывает свет, звук и места для отдыха. Смысл — помочь человеку заранее выбрать комфортный маршрут." },
  { id: "narkomfin", itemId: "narkomfin", duration: 14000,
    description: "Архитектурный замысел Дома Наркомфина стал основой сайта. Интерактивная модель приглашает исследовать здание: подниматься на крышу, находить кафе и книжный, смотреть на дом при дневном и ночном свете." },
  { id: "eleven", itemId: "eleven", duration: 14000,
    scenes: [[0.2, 3.5], [7.8, 18.5]],
    description: "Велопроект Виктора Доронина — 11 111 км за 31 день. Сайт связывает дневник подготовки и приглашение партнёров: можно следить за проектом и найти свой формат участия." },
  { id: "intuition", kind: "ПОДХОД", meta: "", itemId: "principle-data-intuition", showcaseId: "eleven", duration: 12000,
    poster: "assets/case-figures/11111-1.jpg",
    description: "Время и погода в Дубае задают свет и цвет сайта «11 111». Ползунок позволяет прожить день от рассвета до ночи. Данные дают опору, интуиция — форму." },
  { id: "shirokostup", itemId: "shirokostup", duration: 12000,
    description: "Кураторская практика, тексты и архив Ольги Широкоступ получают собственный редакционный ритм. Сайт и инфраструктуру подготовили так, чтобы дальше она могла вести его сама." },
  { id: "tarski", itemId: "tarski", duration: 12000,
    scenes: [[0.2, 4.2], [6.4, 12.4]],
    description: "Первая концептуальная версия сайта молодой культурной институции Tarski. Программа, редакционные материалы и сеть участников знакомят с её направлением; сайт будет расти вместе с институцией." },
  { id: "krainiuk", itemId: "krainiuk", duration: 16000,
    scenes: [[4.1, 7.9], [10, 14.8], [22.3, 29.7]],
    description: "Сайт тренера Екатерины Крайнюк помогает выбрать направление: плавание, велосипед, бег или триатлон. Форматы занятий, рассказ о тренере и результаты спортсменов помогают познакомиться с Катей до первого разговора." },
  { id: "engineering", kind: "ПОДХОД", meta: "", itemId: "principle-design-engineering", showcaseId: "krainiuk", duration: 12000,
    poster: "assets/observation-stills/krainiuk-cards.jpg",
    description: "В «Картах на старт» у Крайнюк соединяю дизайн и код: три карты складываются в шуточный прогноз. Рабочий прототип позволяет проверить композицию и взаимодействие сразу в деле." },
  { id: "ks-fish", itemId: "ks-fish", duration: 14000,
    description: "Рыбная лавка капитана Селёдкина знакомит с Олегом Гугунавой ещё до первого визита. Каталог помогает выбрать рыбу, узнать цену и перейти к заказу. А за ассортиментом остаётся виден сам человек." },
  { id: "goal", kind: "ПОДХОД", meta: "", itemId: "principle-goal", showcaseId: "ks-fish", duration: 12000,
    poster: "assets/case-figures/ks-fish-1.jpg",
    description: "Начинаю с того, что нужно людям и проекту. В «Судовом журнале» лавки — фотографии и рассказы владельца с переходом к заказу. Сохранить его голос и помочь выбрать рыбу важнее выбора инструментов." },
  {
    id: "contact", kind: "СВЯЗАТЬСЯ", title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
    description: "Если вам близок такой подход — напишите мне. Буду рад познакомиться, обсудить идею и вместе найти для неё форму.",
    href: "mailto:anton@gorokhovatsky.tech", x: 50, y: 54,
  },
];

const createObservationRoute = ({
  clearMapSelection, getSelectedMapId, getStepPosition, hideMapPreview,
  isTimeModeActive, renderShowcase, renderSyntheticStep, setShowcasePaused,
  selectMapItem, setMapFilter, setTimeMode, writeUrlState,
}) => {
  const find = name => document.querySelector(`[data-observation-${name}]`);
  const startButton = document.querySelector("[data-start-observation]");
  const inspector = document.querySelector("[data-map-inspector]");
  const controls = find("controls"), progress = find("progress"), status = find("status");
  const previous = find("previous"), playback = find("pause"), next = find("next");
  const indexMenu = find("index"), indexList = find("steps"), playbackState = find("playback-state");
  const titleOf = step => step.title || mapItems.find(item => item.id === step.itemId).title;
  let active = false, paused = false, stepIndex = 0, timer = 0, deadline = 0, remaining = 0;

  observationSteps.forEach((step, index) => {
    indexList.add(new Option(`${index + 1}. ${titleOf(step)}`, index));
  });

  const clearTimer = () => {
    if (timer) remaining = Math.max(0, deadline - performance.now());
    window.clearTimeout(timer);
    timer = 0;
  };
  const updateControls = () => {
    const last = stepIndex === observationSteps.length - 1;
    setShowcasePaused(paused || document.hidden);
    if ((last && document.activeElement === playback)
      || (stepIndex === 0 && document.activeElement === previous)) next.focus();
    progress.textContent = `${String(stepIndex + 1).padStart(2, "0")} / ${observationSteps.length}`;
    previous.disabled = stepIndex === 0;
    playback.hidden = last;
    const label = paused ? "Продолжить обзор" : "Приостановить обзор";
    playback.setAttribute("aria-label", label);
    playback.title = label;
    playback.dataset.paused = String(paused);
    playbackState.textContent = last ? "Обзор завершён" : paused ? "На паузе" : "Автопоказ";
    next.setAttribute("aria-label", last ? "К карте" : "Следующий шаг");
    next.title = next.getAttribute("aria-label");
    next.classList.toggle("is-last", last);
    indexList.value = stepIndex;
  };
  const pause = () => {
    if (!active || paused) return;
    clearTimer();
    paused = true;
    updateControls();
  };
  const scheduleStep = () => {
    clearTimer();
    setShowcasePaused(paused || document.hidden);
    if (!active || paused || document.hidden) return;
    if (stepIndex === observationSteps.length - 1) {
      paused = true;
      updateControls();
      return;
    }
    deadline = performance.now() + remaining;
    timer = window.setTimeout(() => {
      timer = 0;
      renderStep(stepIndex + 1);
    }, remaining);
  };
  function renderStep(index) {
    if (!active) return;
    clearTimer();
    stepIndex = Math.max(0, Math.min(observationSteps.length - 1, Number(index) || 0));
    const step = observationSteps[stepIndex];
    remaining = step.duration || 0;
    const position = getStepPosition(step);
    signalField.style.setProperty("--observation-camera-x", `${Math.max(-5.2, Math.min(5.2, (50 - position.x) * 0.12))}%`);
    signalField.style.setProperty("--observation-camera-y", `${Math.max(-3.6, Math.min(3.6, (54 - position.y) * 0.09))}%`);
    renderShowcase(step);
    if (step.itemId) selectMapItem(step.itemId, { reveal: true, updateHistory: false, overview: step });
    else renderSyntheticStep(step);
    updateControls();
    status.textContent = `Обзор работ: шаг ${stepIndex + 1} из ${observationSteps.length}. ${titleOf(step)}`;
    writeUrlState({ point: null, route: "observation", step: stepIndex + 1, view: null }, { replace: true });
    scheduleStep();
  }
  const chooseStep = index => {
    paused = true;
    renderStep(index);
  };
  const stop = ({ updateHistory = true, closeInspector = true } = {}) => {
    clearTimer();
    active = false;
    paused = false;
    controls.hidden = true;
    indexMenu.hidden = true;
    delete signalField.dataset.observationActive;
    renderShowcase();
    for (const property of ["--observation-camera-x", "--observation-camera-y"]) signalField.style.removeProperty(property);
    if (closeInspector) clearMapSelection();
    if (updateHistory) writeUrlState({ route: null, step: null, point: closeInspector ? null : getSelectedMapId() }, { replace: true });
  };
  const start = ({ step = 0, autoplay = true, updateHistory = true, source = "direct" } = {}) => {
    if (isTimeModeActive()) setTimeMode(false, { updateHistory: false, restoreFilter: false });
    setMapFilter("all", { updateHistory: false });
    hideMapPreview({ immediate: true });
    active = true;
    paused = !autoplay || reducedMotion.matches || matchMedia("(max-width: 900px)").matches;
    signalField.setAttribute("data-observation-active", "");
    controls.hidden = false;
    indexMenu.hidden = false;
    if (updateHistory) {
      trackPortfolioEvent("observation_start", { source });
      writeUrlState({ route: "observation", step: Number(step) + 1, point: null, view: null, filter: null, hash: "#map" });
    }
    renderStep(step);
  };
  const finish = () => {
    trackPortfolioEvent("observation_complete", { source: "route" });
    stop();
    startButton.focus({ preventScroll: true });
  };
  startButton.addEventListener("click", () => start());
  previous.addEventListener("click", () => chooseStep(stepIndex - 1));
  next.addEventListener("click", () => stepIndex === observationSteps.length - 1 ? finish() : chooseStep(stepIndex + 1));
  playback.addEventListener("click", () => {
    paused = !paused;
    updateControls();
    scheduleStep();
  });
  indexList.addEventListener("change", () => chooseStep(indexList.value));
  indexList.addEventListener("focus", pause);
  inspector.addEventListener("pointerdown", event => {
    if (!event.target.closest("[data-observation-controls]")) pause();
  });
  inspector.addEventListener("wheel", pause, { passive: true });
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) pause(); });
  document.addEventListener("visibilitychange", () => { if (active) scheduleStep(); });
  document.addEventListener("keydown", event => {
    if (!active || event.defaultPrevented || event.target.closest("input, textarea, select, [contenteditable=true]")
      || event.altKey || event.metaKey || event.ctrlKey) return;
    if (["Tab", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) pause();
    if (event.key === "ArrowLeft" && stepIndex > 0) {
      event.preventDefault();
      chooseStep(stepIndex - 1);
    } else if (event.key === "ArrowRight" && stepIndex < observationSteps.length - 1) {
      event.preventDefault();
      chooseStep(stepIndex + 1);
    }
  }, true);
  return { get active() { return active; }, get step() { return stepIndex; }, start, steps: observationSteps, stop };
};

export { createObservationRoute, observationSteps };
