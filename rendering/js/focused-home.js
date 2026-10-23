import {pane} from './pane-viewport.js';
import { mapItems, getMapPreviewPoster } from './map-data.js';
import { updateWorkTags } from './work-tags.js';
import { mapButtons, clearMapSelection, selectMapItem, requestMapLinksRender, syncMapNodeAvailability, setMapRovingId, setTimeMode } from './map-engine.js';

const compact = pane.media('(max-width: 900px)');
const stackedStory = matchMedia('(max-width: 999px)');
const home = document.querySelector('.focused-home');
const field = home.querySelector('.focused-home__map');
const camera = document.querySelector('[data-map-camera]');
const labels = document.querySelector('[data-map-labels]');
const header = document.querySelector('.site-header');
const anchors = [camera, labels, header].map(element => {
  const anchor = document.createComment('Original map placement');
  element.before(anchor);
  return anchor;
});
const openMap = document.querySelector('[data-focused-map-open]');
const returnHome = document.querySelector('[data-focused-return]');
const mobileDock = document.querySelector('.mobile-first-dock');
const preview = document.querySelector('.point-preview');
const previewTitle = preview.querySelector('h2');
const previewLink = preview.querySelector('a');
const previewClose = preview.querySelector('button');
const map = document.querySelector('[data-practice-map]');
// Keep the overlay in the main landmark, outside the map's isolated stack.
map.after(preview);
let previewId = null;
let returnToPreview = false;
let wasReading = false;
let overviewReturn = false;
let restoring = false;
let sceneRevision = 0, sceneAnimations = [];

function stopSceneMotion() {
  sceneRevision++;
  sceneAnimations.forEach(animation => animation.cancel());
  sceneAnimations = [];
  document.body.classList.remove('is-map-switching');
}
async function changeScene(focused, event) {
  const planes = [camera, labels, ...document.querySelectorAll('.spatial-field, .project-satellites')];
  const current = planes.map(element => {
    const style = getComputedStyle(element);
    return { opacity: style.opacity, filter: style.filter };
  });
  stopSceneMotion();
  const apply = () => setScene(focused, { write: true, focus: true });
  if (!event.detail || document.documentElement.dataset.reduceMotion === 'true'
      || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  const revision = sceneRevision;
  const soft = { opacity: 0, filter: 'blur(6px)' };
  const tokens = getComputedStyle(document.documentElement);
  const animate = (frames, duration, role) => {
    sceneAnimations = planes.map((element, index) => element.animate(frames(index), {
      duration, easing: tokens.getPropertyValue('--motion-' + role).trim(), fill: 'both',
    }));
    return Promise.all(sceneAnimations.map(animation => animation.finished.catch(() => {})));
  };
  document.body.classList.add('is-map-switching');
  pane.syncState();
  await animate(index => [current[index], soft], 80, 'exit');
  if (revision !== sceneRevision) return;
  apply();
  // Reparent once, then let both the map and its label solver settle while soft.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (revision !== sceneRevision) return;
  sceneAnimations.forEach(animation => animation.cancel());
  await animate(() => [soft, { opacity: 1, filter: 'blur(0px)' }], 200, 'enter');
  if (revision === sceneRevision) stopSceneMotion();
}

const landmarks = {
  garage: ['ИНСТИТУЦИИ', 'Музей «Гараж»'],
  narkomfin: ['', 'Дом Наркомфина'],
  'private-practice': ['ПРОЕКТЫ', 'Частная практика'],
  eleven: ['', '11 111'],
  'ks-fish': ['', 'Рыбная лавка'],
  'principle-data-intuition': ['ПРИНЦИПЫ', 'Аналитика и интуиция'],
  running: ['ЛИЧНОЕ', 'Бег'],
  youtube: ['', 'YouTube'],
};
for (const [id, [direction, name]] of Object.entries(landmarks)) {
  const label = document.querySelector(`[data-map-label-id="${id}"]`);
  label.classList.add('direction-landmark');
  label.replaceChildren();
  if (direction) {
    const caption = document.createElement('small');
    caption.className = 'direction-landmark__kind';
    caption.textContent = direction;
    label.append(caption);
  }
  const title = document.createElement('span');
  title.textContent = name;
  label.append(title);
  const button = mapButtons.get(id);
  if (id !== 'youtube') label.classList.add('mobile-landmark');
  label.addEventListener('click', () => { if (compact.matches && !button.inert) button.click(); });
  const sync = () => label.toggleAttribute('data-mobile-hidden', button.inert || button.getAttribute('aria-hidden') === 'true');
  new MutationObserver(sync).observe(button, { attributes: true, attributeFilter: ['inert','aria-hidden'] });
  sync();
}

const summaries = {
  eleven: 'Сайт велопроекта Виктора Доронина: 11 111 км за 31 день. История заезда, маршрут и ритм дня и ночи.',
  'ks-fish': 'Каталог, рецепты и «Судовой журнал» московской рыбной лавки.',
  'principle-data-intuition': 'О данных, интуиции и том, как рождается идея продукта.',
  youtube: 'Игровые видео и любимый стрим Дмитрия Куплинова.',
};
const actionLabel = item => item.id === 'garage' ? 'О работе в Музее'
  : item.id === 'private-practice' ? 'Проекты частной практики'
  : item.kind === 'practice' ? 'Читать принцип'
  : item.id === 'running' ? 'О беге'
  : item.kind === 'personal' ? 'Подробнее'
  : item.kind === 'project' ? 'Открыть кейс' : 'Подробнее о работе';

function writePreview(id, replace = false) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('preview', id);
  else url.searchParams.delete('preview');
  history[replace ? 'replaceState' : 'pushState'](history.state, '', url);
}
function positionPreview() {
  if (!previewId || preview.hidden) return;
  const node = mapButtons.get(previewId)?.getBoundingClientRect();
  const dockTop = document.querySelector('.mobile-first-dock').getBoundingClientRect().top;
  const headerBottom = Math.max(12, Math.min(header.getBoundingClientRect().bottom, pane.height * .42));
  const midpoint = (headerBottom + dockTop) / 2;
  const above = node && node.y + node.height / 2 > midpoint;
  preview.dataset.placement = above ? 'above' : 'below';
  preview.style.setProperty('--preview-top', `${Math.max(68, headerBottom + 12)}px`);
}
function showPreview(id, { write = true, focus = true } = {}) {
  const item = mapItems.find(item => item.id === id);
  if (!item || !compact.matches) return;
  previewId = id;
  selectMapItem(id, { reveal: false, updateHistory: false });
  previewTitle.textContent = landmarks[id]?.[1] || item.title;
  preview.querySelector('.point-preview__kind').textContent = item.kindLabel;
  const firstSentence = item.description.split(/(?<=[.!?])\s+/)[0];
  preview.querySelector('.point-preview__description').textContent = summaries[id] || (firstSentence.length > 240 ? firstSentence.slice(0, 237).replace(/\s+\S*$/, '') + '…' : firstSentence);
  updateWorkTags(preview, id);
  const tags = preview.querySelector(':scope > .work-tags');
  if (tags) previewLink.before(tags);
  const image = preview.querySelector('img');
  const poster = getMapPreviewPoster(item);
  image.hidden = !poster;
  preview.classList.toggle('has-image', Boolean(poster));
  if (poster) image.src = poster;
  else image.removeAttribute('src');
  image.alt = '';
  const url = new URL(location.href);
  url.searchParams.set('point', id);
  url.searchParams.set('preview', id);
  url.hash = 'map';
  previewLink.href = url;
  previewLink.querySelector('span').textContent = actionLabel(item);
  preview.hidden = false;
  document.body.classList.add('has-point-preview');
  mapButtons.forEach((button, key) => button.setAttribute('aria-expanded', String(key === id)));
  if (write) writePreview(id);
  positionPreview();
  syncReading();
  if (focus) previewTitle.focus({ preventScroll: true });
}
function closePreview({ focus = true, write = true } = {}) {
  const previous = previewId;
  previewId = null;
  preview.hidden = true;
  document.body.classList.remove('has-point-preview');
  clearMapSelection({ updateHistory: false });
  if (write) writePreview(null, true);
  if (focus && previous) setMapRovingId(previous, { focus: true });
}
function setScene(focused, { write = false, focus = false } = {}) {
  focused = focused && compact.matches;
  if (focused) setTimeMode(false, { updateHistory: false });
  document.body.classList.toggle('has-focused-home', focused);
  document.body.classList.toggle('has-full-mobile-map', compact.matches && !focused);
  document.body.toggleAttribute('data-mobile-preview-ui', compact.matches);
  pane.syncState();
  for (const [id, [direction]] of Object.entries(landmarks)) {
    const label = document.querySelector(`[data-map-label-id="${id}"]`);
    label.dataset.materialActive = focused && (direction || id === 'youtube') ? 'none' : 'always';
  }
  if (focused) {
    home.prepend(header);
    field.append(camera, labels);
  } else [camera, labels, header].forEach((element, i) => anchors[i].after(element));
  if (write) {
    closePreview({ focus: false, write: false });
    const url = new URL(location.href);
    url.searchParams.delete('preview');
    if (focused) { url.searchParams.delete('scene'); url.searchParams.delete('view'); }
    else url.searchParams.set('scene', 'map');
    history.pushState(null, '', url);
  }
  syncMapNodeAvailability();
  setMapRovingId((previewId && !mapButtons.get(previewId)?.inert ? previewId : [...mapButtons].find(([, button]) => !button.inert)?.[0]) || 'garage');
  mapButtons.forEach(button => button.setAttribute('aria-controls', compact.matches ? 'mobile-point-preview' : 'map-inspector'));
  requestMapLinksRender();
  syncMeasurements();
  window.dispatchEvent(new Event('resize'));
  syncReading();
  if (focus) (focused ? openMap : returnHome).focus({ preventScroll: true });
}
function syncReading() {
  const folded = stackedStory.matches && document.body.classList.contains('has-story-pane');
  const reading = Boolean(document.querySelector('.map-inspector.is-open'))
    || document.body.matches('.has-content-panel, .has-settings-panel, .has-constellation-nav, .has-command-focus');
  home.inert = reading || !document.body.classList.contains('has-focused-home');
  field.inert = folded;
  returnHome.inert = folded || reading || !document.body.classList.contains('has-full-mobile-map');
  camera.inert = folded || compact.matches && reading;
  labels.inert = folded || compact.matches && reading;
  mobileDock.inert = folded || compact.matches && document.body.classList.contains('has-constellation-nav');
  preview.inert = folded || reading || preview.hidden;
  if (wasReading && !reading && returnToPreview && previewId) {
    returnToPreview = false;
    requestAnimationFrame(() => {
      showPreview(previewId, { write: false, focus: false });
      previewLink.focus({ preventScroll: true });
    });
  }
  wasReading = reading;
}
function syncMeasurements() {
  document.documentElement.style.setProperty('--focused-author-bottom', `${Math.ceil(header.getBoundingClientRect().bottom)}px`);
  positionPreview();
}
function restoreScene() {
  if (restoring) return;
  stopSceneMotion();
  restoring = true;
  const url = new URL(location.href);
  // A direct case link needs the complete map as its return destination.
  // Preview links retain the introductory scene and its selected point.
  if (compact.matches && url.searchParams.has('point') && !url.searchParams.has('preview')) {
    url.searchParams.set('scene', 'map');
    history.replaceState(history.state, '', url);
  }
  setScene(url.searchParams.get('scene') !== 'map' && url.searchParams.get('view') !== 'time');
  const id = url.searchParams.get('preview');
  if (id && (!url.searchParams.has('point') || url.searchParams.get('point') === id)) {
    if (url.searchParams.has('point')) returnToPreview = true;
    showPreview(id, { write: false, focus: false });
  }
  else if (!id && previewId) closePreview({ write: false, focus: false });
  restoring = false;
}
window.addEventListener('mobile-point-request', event => showPreview(event.detail.id));
previewClose.addEventListener('click', () => closePreview());
previewLink.addEventListener('click', event => {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  returnToPreview = true;
  selectMapItem(previewId, { reveal: true });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && previewId && !preview.inert) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closePreview();
  }
}, true);
openMap.addEventListener('click', event => changeScene(false, event));
returnHome.addEventListener('click', event => changeScene(true, event));
document.querySelector('[data-start-observation]').addEventListener('click', () => {
  closePreview({ focus: false });
  if (!document.body.classList.contains('has-focused-home')) return;
  overviewReturn = true;
  setScene(false);
}, true);
new MutationObserver(() => {
  if (compact.matches && map.hasAttribute('data-time-view') && document.body.classList.contains('has-focused-home')) {
    closePreview({ focus: false, write: false });
    setScene(false);
  }
  if (overviewReturn && !map.hasAttribute('data-observation-active')) {
    overviewReturn = false;
    setScene(true);
  }
}).observe(map, { attributes: true, attributeFilter: ['data-observation-active', 'data-time-view'] });
window.addEventListener('popstate', restoreScene);
compact.addEventListener('change', restoreScene);
stackedStory.addEventListener('change', syncReading);
window.addEventListener('resize', syncMeasurements);
window.addEventListener('reading-surface-change', syncReading);
new MutationObserver(syncReading).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-case-open'] });
let measurementFrame = 0;
new ResizeObserver(() => {
  if (measurementFrame) return;
  measurementFrame = requestAnimationFrame(() => { measurementFrame = 0; syncMeasurements(); });
}).observe(header);
restoreScene();
