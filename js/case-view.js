// Expanded professional cases reuse the map inspector and its single video.
import { mapItems } from "./map-data.js";
import { mapInspector, selectMapItem, hideMapPreview, observationRoute } from "./map-engine.js";
import { reducedMotion } from "./preferences.js";
import { scrollRegionFromKey } from "./viewport-ui.js";
import "./panels.js";

const items = new Map(mapItems.map(item => [item.id, item]));
const body = document.body;
const originalChildren = [...mapInspector.children];
const close = mapInspector.querySelector("[data-close-inspector]");
const kind = mapInspector.querySelector("[data-map-kind]");
const identity = mapInspector.querySelector(".map-readout__identity");
const description = mapInspector.querySelector(".map-readout__description");
const related = mapInspector.querySelector("[data-map-related]");
const header = document.createElement("div");
header.className = "case-header";
const viewport = document.createElement("div");
viewport.className = "case-scroll";
viewport.tabIndex = 0;
viewport.setAttribute("role", "region");
viewport.setAttribute("aria-label", "Содержимое кейса");
// Match the existing panel keyboard pattern when the region itself is focused.
// Do not steal keys from links/buttons or selection; wheel and touch stay native.
viewport.addEventListener("keydown", (event) => {
  if (event.target !== viewport || event.defaultPrevented || event.isComposing
    || event.altKey || event.shiftKey) return;
  scrollRegionFromKey(event, viewport, reducedMotion.matches);
});
const layout = document.createElement("div");
layout.className = "case-layout";
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
function mount() {
  header.append(kind, close);
  for (const element of [identity, description]) {
    element.removeAttribute("data-material-surface");
    element.removeAttribute("data-material-active");
  }
  sheet.append(identity, inlineSlot, description);
  story.append(sheet, related);
  layout.append(story);
  viewport.append(layout);
  mapInspector.append(header, viewport);
  mapInspector.classList.add("is-case-view");
  mapInspector.setAttribute("role", "dialog");
  mapInspector.setAttribute("aria-modal", "true");
  body.setAttribute("data-case-open", "");
  suspendBackground();
}
function unmount() {
  resumeBackground();
  originalChildren.forEach(element => mapInspector.append(element));
  header.remove();
  viewport.remove();
  identity.dataset.materialSurface = "inspector-identity";
  description.dataset.materialSurface = "inspector-description";
  for (const element of [identity, description]) element.dataset.materialActive = "always";
  mapInspector.classList.remove("is-case-view");
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
  const playing = wantsPlayback && !document.hidden;
  pause.textContent = playing ? "Пауза" : "Смотреть фрагмент";
  pause.setAttribute("aria-label", playing ? "Приостановить видео проекта" : "Воспроизвести видео проекта");
  if (playing) video.play().catch(() => {
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
  if (reel.parentElement !== parent) moveMedia(parent, reel, inlineMedia.matches ? null : story);
}
function pinReel(item) {
  if (!item?.previewVideo) {
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
  const selected = items.get(mapInspector.dataset.selectedMapId);
  const eligible = mapInspector.classList.contains("is-open")
    && !body.classList.contains("has-content-panel") && !observationRoute.active
    && ["company", "project"].includes(selected?.kind);
  const nextId = eligible ? selected.id : null;
  if (nextId === activeId) return;
  if (nextId) {
    if (!activeId) mount();
    hideMapPreview({ immediate: true });
    mapInspector.dataset.caseMedia = selected.previewVideo ? "true" : "false";
    viewport.scrollTop = 0;
    mapInspector.scrollTop = 0;
    pinReel(selected);
    requestAnimationFrame(() => identity.querySelector("h2").focus({ preventScroll: true }));
  } else {
    pinReel(null);
    if (activeId) {
      const closing = !mapInspector.classList.contains("is-open");
      // Commit the closed state before restoring the small native readout.
      // Otherwise its old geometry flashes during the inherited opacity exit.
      if (closing) mapInspector.style.transition = "none";
      unmount();
      if (closing) {
        void mapInspector.offsetHeight;
        mapInspector.style.removeProperty("transition");
      }
    }
  }
  activeId = nextId;
}
new MutationObserver(reflect).observe(mapInspector, {
  attributes: true, attributeFilter: ["class", "data-selected-map-id", "aria-hidden"],
});
new MutationObserver(reflect).observe(body, { attributes: true, attributeFilter: ["class"] });

// Restore the map BEFORE the existing close handler returns focus to its node.
close.addEventListener("click", resumeBackground, true);
document.addEventListener("keydown", event => {
  if (!activeId || document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    close.click();
  } else if (event.key === "Tab") {
    const focusable = [...mapInspector.querySelectorAll('button, a[href], [tabindex="0"]')]
      .filter(element => !element.hidden && !element.disabled && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === identity.querySelector("h2"))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }
}, true);
related.addEventListener("click", event => {
  const link = event.target.closest("a.map-related__item");
  if (!activeId || !link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = new URL(link.href).searchParams.get("point");
  if (!items.has(id)) return;
  event.preventDefault();
  selectMapItem(id, { reveal: true });
});
new ResizeObserver(() => {
  header.style.paddingRight = (viewport.offsetWidth - viewport.clientWidth) + "px";
}).observe(viewport);
reflect();
