import { trackPortfolioEvent } from "./analytics.js";
import { mapItems } from "./map-data.js";
import { reducedMotion } from "./preferences.js";
import { signalField } from "./signal-field.js";

const observationSteps = [
  { id: "garage", itemId: "garage", showcaseId: "garage-site", duration: 20000,
    description: "Почти четыре года развивал цифровые проекты Музея «Гараж»: основной сайт, онлайн-коллекцию, архивы и образовательные проекты. Проводил исследования, определял приоритеты, проектировал интерфейсы и координировал работу команд — от первых гипотез до запуска и дальнейшего развития. Стратегию и дизайн основного сайта создала Charmer Studio." },
  { id: "collection", itemId: "collection", duration: 20000,
    description: "Из произведения — к автору, из каталога — в открытое хранение. Помогал связать знакомство с коллекцией и визит в музей: продуктовая логика, исследования, интерфейс и координация реализации. Отдельные экраны складываются в маршрут, по которому можно продолжить знакомство с искусством." },
  { id: "narkomfin", itemId: "narkomfin", duration: 22000,
    description: "Знакомство с Домом Наркомфина на сайте начинается с самого здания. Его интерактивную модель можно рассмотреть при дневном и ночном освещении, а затем перейти к истории дома или спланировать визит — выбрать экскурсию, узнать о кафе и книжном. Архитектура становится основой навигации и задаёт характер всему сайту." },
  { id: "eleven", itemId: "eleven", title: "11\u00a0111", duration: 24000,
    description: "Велопроект Виктора Доронина — 11\u00a0111\u00a0км за 31\u00a0день. Сайт связывает дневник подготовки и приглашение партнёров: можно следить за проектом и найти свой формат участия. Свет и цвет меняются вслед за временем и погодой в Дубае — место действия становится частью сайта." },
  { id: "shirokostup", itemId: "shirokostup", duration: 18000,
    description: "Кураторская практика, тексты и архив Ольги Широкоступ получают собственный редакционный ритм. Сайт и инфраструктуру подготовили так, чтобы дальше она могла вести его сама. Возможность продолжать работу без разработчика — часть задачи проекта." },
  { id: "tarski", itemId: "tarski", duration: 18000,
    description: "Первая концептуальная версия сайта молодой культурной институции Tarski. Программа, редакционные материалы и сеть участников знакомят с её направлением. Структура оставляет место для новых материалов: сайт будет расти вместе с институцией." },
  { id: "krainiuk", itemId: "krainiuk", duration: 32000,
    description: "Сайт тренера Екатерины Крайнюк помогает выбрать направление и познакомиться с Катей до первого разговора. Форматы занятий и результаты спортсменов отвечают на практические вопросы, а «Карты на старт» добавляют игру. Интерфейс и взаимодействие проектировал и собирал в коде — от первого экрана до раскрытия карт." },
  { id: "ks-fish", itemId: "ks-fish", duration: 26000,
    description: "Рыбная лавка капитана Селёдкина знакомит с Олегом Гугунавой ещё до первого визита. Каталог помогает выбрать рыбу и перейти к заказу, а «Судовой журнал» сохраняет фотографии и рассказы владельца. Его голос остаётся частью сайта — за ассортиментом виден сам человек." },
  {
    id: "contact", kind: "СВЯЗАТЬСЯ", title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
    description: "Если вы ищете человека в команду или хотите обсудить проект, напишите мне. Буду рад познакомиться.",
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
    progress.textContent = `${stepIndex + 1} / ${observationSteps.length}`;
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
