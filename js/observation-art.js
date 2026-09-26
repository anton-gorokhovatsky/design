import { reducedMotion } from "./preferences.js";

// Artwork belongs to the route. It never fetches media before the route opens.
const createObservationArt = () => {
  const card = document.querySelector("[data-observation-title-card]");
  const map = card.parentElement;
  const preview = document.querySelector("[data-observation-preview]");
  const compact = matchMedia("(max-width: 900px)");
  const video = card.querySelector("video");
  const title = card.querySelector("[data-observation-card-title]");
  const eyebrow = card.querySelector("[data-observation-card-eyebrow]");
  const caption = card.querySelector("[data-observation-card-caption]");
  const lines = card.querySelector("svg");
  const inspector = document.querySelector("[data-map-inspector]");
  let animations = [];
  let mode = "";

  const place = () => {
    if (compact.matches) {
      if (card.parentElement !== preview.parentElement) preview.before(card);
      card.style.removeProperty("left");
      card.style.removeProperty("top");
      card.style.removeProperty("width");
    } else {
      if (card.parentElement !== map) map.append(card);
      if (card.hidden || document.documentElement.dataset.capture === "og") return;
      const field = map.getBoundingClientRect();
      const view = document.querySelector('[data-floating-console="view"]').getBoundingClientRect();
      const display = document.querySelector('[data-floating-console="display"]').getBoundingClientRect();
      const readout = inspector.getBoundingClientRect();
      const left = Math.max(24, view.right - field.left + 24);
      const right = Math.min(field.width - 24, display.left - field.left - 24);
      const bottom = Math.max(220, readout.top - field.top - 24);
      const width = Math.max(260, Math.min(800, right - left, (bottom - 24) * 1200 / 630));
      card.style.width = `${width}px`;
      card.style.left = `${left + (right - left - width) / 2}px`;
      card.style.top = `${(24 + bottom) / 2}px`;
    }
  };
  compact.addEventListener("change", place);
  new ResizeObserver(place).observe(inspector);
  window.addEventListener("resize", place);
  place();

  const load = (element, source = element.dataset.src) => {
    if (!element.hasAttribute("src")) element.src = source;
  };
  video.addEventListener("loadeddata", () => card.classList.add("has-atlas-frame"));

  const clear = () => {
    animations.forEach(animation => animation.cancel());
    animations = [];
    video.pause();
    card.hidden = true;
    mode = "";
    delete map.dataset.observationIntro;
  };

  const sync = (playing) => {
    const run = playing && !document.hidden && !reducedMotion.matches;
    if (mode === "intro" && run) {
      load(video, "assets/observation/atlas.mp4");
      video.play().catch(() => { /* The still frame remains available. */ });
    } else video.pause();
    animations.forEach(animation => run ? animation.play() : animation.pause());
  };

  const intro = () => {
    clear();
    mode = "intro";
    card.dataset.scene = mode;
    map.dataset.observationIntro = "true";
    eyebrow.textContent = "Работы и интересы";
    title.innerHTML = "Антон<br>Гороховатский";
    caption.textContent = "Придумываю, разрабатываю и веду веб-проекты.";
    load(card.querySelector("[data-atlas-poster]"));
    if (video.readyState) video.currentTime = 0;
    card.hidden = false;
    place();
  };

  // The Filament study becomes a short editorial hinge, not an effect over a reel.
  const chapter = (id) => {
    clear();
    if (reducedMotion.matches) return;
    mode = "chapter";
    card.dataset.scene = mode;
    eyebrow.textContent = id === "private-practice" ? "02 / Независимые проекты" : "03 / Подход";
    title.innerHTML = id === "private-practice" ? "Частная<br>практика" : "От замысла<br>к запуску";
    caption.textContent = "Продукт · Дизайн · Разработка";
    load(card.querySelector("[data-filament-poster]"));
    if (!lines.children.length) {
      for (let group = 0; group < 3; group++) {
        for (let strand = 0; strand < 7; strand++) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const y = 90 + group * 220 + (strand - 3) * 9;
          path.setAttribute("d", `M 680 ${y} C 880 ${y}, 900 ${315 + strand * 2}, 1180 ${315 + strand * 2}`);
          path.setAttribute("pathLength", "1");
          lines.append(path);
        }
      }
    }
    card.hidden = false;
    place();
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--motion-shift").trim();
    const fade = card.animate([
      { opacity: 0 }, { opacity: 1, offset: .12 },
      { opacity: 1, offset: .8 }, { opacity: 0 },
    ], { duration: 1400, fill: "both" });
    animations = [fade, ...Array.from(lines.children, path => path.animate(
      [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      { duration: 1100, easing, fill: "both" },
    ))];
    fade.onfinish = clear;
  };

  return { clear, intro, chapter, sync };
};

export { createObservationArt };
