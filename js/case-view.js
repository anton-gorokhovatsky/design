// Every readout keeps a stationary rounded frame and a single inner scroller.
import { mapItems } from "./map-data.js";
import { mapInspector, hideMapPreview, observationRoute } from "./map-engine.js";
import { getTabStops, reducedMotion } from "./preferences.js";
import { scrollRegionFromKey, observeScrollLens, clearScrollLenses, observeScrollEdges } from "./viewport-ui.js";
import "./panels.js";

const items = new Map(mapItems.map(item => [item.id, item]));
const body = document.body;
const originalChildren = [...mapInspector.children];
const close = mapInspector.querySelector("[data-close-inspector]");
const kind = mapInspector.querySelector("[data-map-kind]");
const identity = mapInspector.querySelector(".map-readout__identity");
const header = document.createElement("div");
header.className = "case-header";
const viewport = document.createElement("div");
viewport.className = "case-scroll";
viewport.tabIndex = 0;
viewport.setAttribute("role", "region");
viewport.setAttribute("aria-label", "Содержимое карточки");
// Match the existing panel keyboard pattern when the region itself is focused.
// Do not steal keys from links/buttons or selection; wheel and touch stay native.
viewport.addEventListener("keydown", (event) => {
  if (event.target !== viewport || event.defaultPrevented || event.isComposing
    || event.altKey || event.shiftKey) return;
  scrollRegionFromKey(event, viewport, reducedMotion.matches);
});
const layout = document.createElement("div");
layout.className = "case-layout";
layout.addEventListener("wheel", event => {
  if (viewport.contains(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
  viewport.scrollBy({ top: event.deltaY * unit, behavior: "instant" });
  event.preventDefault();
}, { passive: false });
const story = document.createElement("div");
story.className = "case-story";
const sheet = document.createElement("div");
sheet.className = "case-sheet";
sheet.dataset.materialSurface = "case-story";
sheet.dataset.materialActive = "always";
const inlineSlot = document.createElement("div");
inlineSlot.className = "case-inline-media";
const inlineMedia = matchMedia("(max-width: 900px)");
let activeId = null;
let caseMode = false;
const frameMaterials = new Map();
let backgroundState = [];

function suspendBackground() {
  backgroundState = [...mapInspector.parentElement.children]
    .filter(element => element !== mapInspector)
    .map(element => [element, element.inert]);
  for (const [element] of backgroundState) element.inert = true;
}
function resumeBackground() {
  for (const [element, inert] of backgroundState) element.inert = inert;
  backgroundState = [];
}
const caseLens = observeScrollLens(viewport, () => viewport.querySelectorAll(
  ".map-readout__identity h2, .map-readout__identity p, .case-inline-media video, [data-personal-media-poster], [data-personal-media-screen] iframe, [data-map-description], .map-evidence dt, .map-evidence dd, .case-details h3, .case-details h4, .case-details p, .map-related__header, .map-related__item > *",
), { owner: mapInspector });

// The material belongs to a stationary frame; only its transparent child scrolls.
// Preserve and restore existing fragments when returning to the unmounted readout.
function restoreFrameMaterial(element, attributes) {
  element.classList.remove("reading-content");
  for (const [name, value] of attributes) element.setAttribute(name, value);
  frameMaterials.delete(element);
}
function syncFrameMaterials() {
  for (const [element, attributes] of frameMaterials) {
    if (!sheet.contains(element)) restoreFrameMaterial(element, attributes);
  }
  for (const element of story.querySelectorAll("[data-material-surface]")) {
    if (!frameMaterials.has(element)) frameMaterials.set(element,
      ["data-material-surface", "data-material-active"].map(name => [name, element.getAttribute(name)]));
    element.removeAttribute("data-material-surface");
    element.removeAttribute("data-material-active");
    element.classList.add("reading-content");
  }
}
new MutationObserver(syncFrameMaterials).observe(story, { childList: true, subtree: true });
observeScrollEdges(viewport, { owner: mapInspector });
function mount(large) {
  clearScrollLenses(mapInspector);
  header.append(kind, close);
  story.append(...originalChildren.filter(element => element !== kind && element !== close));
  identity.after(inlineSlot);
  viewport.append(story);
  sheet.append(viewport);
  layout.append(sheet);
  mapInspector.append(header, layout);
  syncFrameMaterials();
  mapInspector.classList.add("has-reading-frame");
  if (large) {
    mapInspector.classList.add("is-case-view");
    mapInspector.setAttribute("role", "dialog");
    mapInspector.setAttribute("aria-modal", "true");
    body.setAttribute("data-case-open", "");
    suspendBackground();
  }
}
function unmount() {
  caseLens.reset();
  resumeBackground();
  originalChildren.forEach(element => mapInspector.append(element));
  for (const [element, attributes] of frameMaterials) restoreFrameMaterial(element, attributes);
  header.remove();
  layout.remove();
  mapInspector.classList.remove("is-case-view", "has-reading-frame");
  mapInspector.removeAttribute("role");
  mapInspector.removeAttribute("aria-modal");
  body.removeAttribute("data-case-open");
  mapInspector.removeAttribute("data-case-media");
}

// Reuse the playing hover master: no second decoder, fabricated frame or crop.
const video = document.querySelector("[data-map-preview-video]");
const videoFrame = video.closest(".map-hover-preview__mosaic-main") || video;
const videoHome = videoFrame.parentElement;
const videoNext = videoFrame.nextSibling;
const reel = document.createElement("figure");
reel.className = "case-media";
reel.hidden = true;
reel.innerHTML = '<figcaption><span data-case-media-label>Фрагмент сайта</span><button type="button" class="text-link" data-case-pause>Пауза</button></figcaption>';
const caption = reel.querySelector("figcaption");
const pause = reel.querySelector("button");
let pinnedItem = null;
let wantsPlayback = false;
let deliberatelyPaused = false;
let playbackRequest = 0;
let pendingMediaTime = null;
let hoverHandoff = null;
function moveMedia(parent, node, before = null) {
  if (typeof parent.moveBefore === "function" && node.isConnected && parent.isConnected) {
    parent.moveBefore(node, before);
  } else {
    if (node === video || node.contains(video)) pendingMediaTime = { source: video.src, time: video.currentTime };
    parent.insertBefore(node, before);
  }
}
function syncPlayback() {
  if (!pinnedItem) return;
  const request = ++playbackRequest;
  const playing = wantsPlayback && !document.hidden;
  pause.textContent = playing ? "Пауза" : "Смотреть фрагмент";
  pause.setAttribute("aria-label", playing ? "Приостановить видео проекта" : "Воспроизвести видео проекта");
  if (playing) video.play().catch(() => {
    if (request !== playbackRequest) return;
    wantsPlayback = false;
    pause.textContent = "Смотреть фрагмент";
    pause.setAttribute("aria-label", "Воспроизвести видео проекта");
  });
  else video.pause();
}
video.addEventListener("loadedmetadata", () => {
  if (pinnedItem && pendingMediaTime?.source === video.src) {
    video.currentTime = pendingMediaTime.time;
    pendingMediaTime = null;
    syncPlayback();
  }
});
const rememberHoverFrame = event => {
  const target = event.target.closest("[data-map-id]");
  if (!target || target.dataset.mapId !== video.dataset.previewId
    || !video.closest(".map-hover-preview.is-visible") || video.readyState < 1) return;
  hoverHandoff = { id: target.dataset.mapId, time: video.currentTime,
    source: video.src, capturedAt: performance.now() };
};
document.addEventListener("pointerdown", rememberHoverFrame, true);
document.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") rememberHoverFrame(event);
}, true);
pause.addEventListener("click", () => {
  wantsPlayback = !wantsPlayback;
  deliberatelyPaused = !wantsPlayback;
  syncPlayback();
});
video.addEventListener("pause", () => {
  if (pinnedItem && wantsPlayback && !document.hidden) syncPlayback();
});
document.addEventListener("visibilitychange", syncPlayback);
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) wantsPlayback = false;
  else if (!deliberatelyPaused) wantsPlayback = true;
  syncPlayback();
});
function placeReel() {
  if (!pinnedItem) return;
  const parent = inlineMedia.matches ? inlineSlot : layout;
  if (reel.parentElement !== parent) moveMedia(parent, reel, inlineMedia.matches ? null : sheet);
}
function pinReel(item) {
  if (!item?.previewVideo) {
    playbackRequest++;
    pinnedItem = null;
    wantsPlayback = false;
    reel.hidden = true;
    video.pause();
    if (videoFrame.parentElement !== videoHome) moveMedia(videoHome, videoFrame, videoNext);
    reel.remove();
    pendingMediaTime = null;
    return;
  }
  const changed = pinnedItem?.id !== item.id;
  pinnedItem = item;
  reel.hidden = false;
  placeReel();
  if (videoFrame.parentElement !== reel) moveMedia(reel, videoFrame, caption);
  const source = new URL(item.previewVideo, document.baseURI).href;
  if (video.src !== source) {
    pendingMediaTime = null;
    video.src = item.previewVideo;
    video.dataset.previewId = item.id;
  }
  if (changed && hoverHandoff?.id === item.id && hoverHandoff.source === source
    && performance.now() - hoverHandoff.capturedAt < 1200) {
    if (video.readyState >= 1) video.currentTime = hoverHandoff.time;
    if (typeof reel.moveBefore !== "function") pendingMediaTime = { source, time: hoverHandoff.time };
    hoverHandoff = null;
  }
  video.poster = item.previewPoster || item.previewVideo.split("?")[0]
    .replace("assets/reels/", "assets/reel-posters/").replace(/\.mp4$/i, ".jpg");
  video.setAttribute("aria-label", "Видео сайта: " + item.title);
  reel.dataset.orientation = item.previewOrientation || "landscape";
  reel.querySelector("[data-case-media-label]").textContent =
    "ФРАГМЕНТ САЙТА / " + Math.round(item.previewDuration || 13) + " СЕК";
  if (changed) {
    deliberatelyPaused = false;
    wantsPlayback = !reducedMotion.matches;
  }
  syncPlayback();
}
inlineMedia.addEventListener("change", placeReel);
window.addEventListener("pagehide", () => { wantsPlayback = false; video.pause(); });

function reflect() {
  const selectedId = mapInspector.dataset.selectedMapId;
  const selected = items.get(selectedId);
  const open = mapInspector.classList.contains("is-open")
    && !body.classList.contains("has-content-panel") && Boolean(selectedId);
  const nextId = open ? selectedId : null;
  const large = open && !observationRoute.active && ["company", "project"].includes(selected?.kind);
  if (nextId === activeId && large === caseMode) return;
  if (activeId) {
    const closing = !mapInspector.classList.contains("is-open");
    if (closing) mapInspector.style.transition = "none";
    pinReel(null);
    unmount();
    if (closing) {
      void mapInspector.offsetHeight;
      mapInspector.style.removeProperty("transition");
    }
  }
  if (nextId) {
    mount(large);
    if (large) {
      hideMapPreview({ immediate: true });
      mapInspector.dataset.caseMedia = selected.previewVideo ? "true" : "false";
      pinReel(selected);
    }
    viewport.scrollTop = 0;
    mapInspector.scrollTop = 0;
    requestAnimationFrame(() => identity.querySelector("h2").focus({ preventScroll: true }));
  }
  activeId = nextId;
  caseMode = large;
}
new MutationObserver(reflect).observe(mapInspector, {
  attributes: true, attributeFilter: ["class", "data-selected-map-id", "aria-hidden"],
});
new MutationObserver(reflect).observe(body, { attributes: true, attributeFilter: ["class"] });

// Restore the map BEFORE the existing close handler returns focus to its node.
close.addEventListener("click", resumeBackground, true);
document.addEventListener("keydown", event => {
  if (!activeId || !caseMode || document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    close.click();
  } else if (event.key === "Tab") {
    const focusable = getTabStops(mapInspector);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === identity.querySelector("h2"))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }
}, true);
new ResizeObserver(() => {
  header.style.paddingRight = (viewport.offsetWidth - viewport.clientWidth) + "px";
}).observe(viewport);
reflect();
