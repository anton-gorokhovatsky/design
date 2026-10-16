import { mapButtons, selectedMapId } from './map-engine.js';
import { reducedMotion } from './preferences.js';

const field = document.querySelector('.focused-home__map');
const root = document.documentElement;
const compact = matchMedia('(max-width: 900px)');
const ns = 'http://www.w3.org/2000/svg';
// Depth groups follow the existing map's branches, not an importance ranking.
const depths = new Map([
  ['garage', -56], ['narkomfin', -56],
  ['private-practice', 0], ['eleven', 0], ['ks-fish', 0],
  ['principle-data-intuition', 0], ['running', 56], ['youtube', 56],
]);
const relationships = [['garage', 'narkomfin'], ['private-practice', 'eleven'], ['private-practice', 'ks-fish']];
const nodes = [...depths].map(([id, z]) => ({
  id, z, button: mapButtons.get(id),
  label: document.querySelector(`[data-map-label-id="${id}"]`),
  glyph: mapButtons.get(id).querySelector('.map-node__glyph'),
}));
const svg = document.createElementNS(ns, 'svg');
svg.classList.add('spatial-field'); svg.setAttribute('aria-hidden', 'true');
field.prepend(svg);
const makePath = name => {
  const path = document.createElementNS(ns, 'path'); path.setAttribute('class', name); svg.append(path); return path;
};
const orbits = [-95, 0, 95].map((z, i) => ({ z, path: makePath(`spatial-orbit${i === 0 ? ' spatial-orbit--back' : ''}`) }));
const axes = [makePath('spatial-axis'), makePath('spatial-axis')];
const edges = relationships.map(([a, b]) => ({ a, b, path: makePath('spatial-relation') }));
let width = 1, height = 1, request = 0;
let yaw = -.16, pitch = -.26, selected = null, drag = null;
let liftStarted = 0;
const duration = 200;
const timing = getComputedStyle(root).getPropertyValue('--motion-enter').match(/[\d.]+/g).map(Number);
function ease(progress) {
  const [x1, y1, x2, y2] = timing;
  const curve = (t, a, b) => 3*(1-t)*(1-t)*t*a + 3*(1-t)*t*t*b + t*t*t;
  let low = 0, high = 1;
  for (let i=0; i<12; i++) {
    const middle = (low+high)/2;
    if (curve(middle,x1,x2) < progress) low = middle; else high = middle;
  }
  return curve((low+high)/2,y1,y2);
}
const active = () => compact.matches && document.body.classList.contains('has-focused-home');
const motion = () => !reducedMotion.matches && root.dataset.reduceMotion !== 'true';
const project = (x, y, z, turn = yaw, tilt = pitch) => {
  const x1 = x * Math.cos(turn) + z * Math.sin(turn);
  const z1 = -x * Math.sin(turn) + z * Math.cos(turn);
  const y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
  const scale = 760 / (760 - z2);
  return { x: x1 * scale + width / 2, y: y1 * scale + height / 2, scale };
};
const pathFrom = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
function measure() {
  width = field.clientWidth; height = field.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const node of nodes) {
    node.baseX = parseFloat(node.button.style.getPropertyValue('--x')) * width / 100;
    node.baseY = parseFloat(node.button.style.getPropertyValue('--y')) * height / 100;
    node.radius = node.glyph.offsetWidth / 2;
    let x = node.baseX - width / 2, y = node.baseY - height / 2;
    for (let i = 0; i < 12; i++) {
      const point = project(x, y, node.z, -.16, -.26);
      x += node.baseX - point.x; y += node.baseY - point.y;
    }
    node.x = x; node.y = y;
    node.restScale = project(x, y, node.z, -.16, -.26).scale;
  }
  draw();
}
function draw() {
  if (!active()) return;
  const connected = new Set([selected]);
  relationships.forEach(([a, b]) => { if (a === selected || b === selected) { connected.add(a); connected.add(b); } });
  const geometry = new Map();
  for (const node of nodes) {
    const chosen = node.id === selected;
    const point = project(node.x, node.y, node.z);
    const dx = point.x - node.baseX, dy = point.y - node.baseY;
    // Approach along the viewing ray: selection keeps its projected position.
    const distance = 760 / point.scale;
    const scale = point.scale / node.restScale * distance / (distance - (node.lift || 0));
    for (const element of [node.button, node.label]) {
      element.style.setProperty('--spatial-dx', `${dx.toFixed(2)}px`);
      element.style.setProperty('--spatial-dy', `${dy.toFixed(2)}px`);
      element.toggleAttribute('data-spatial-muted', Boolean(selected) && !connected.has(node.id));
      element.toggleAttribute('data-spatial-selected', chosen);
    }
    node.button.style.setProperty('--spatial-scale', scale.toFixed(4));
    geometry.set(node.id, {...point, radius:node.radius * scale});
  }
  orbits.forEach(({z, path}) => {
    const points = Array.from({length:81}, (_, i) => {
      const angle = i / 80 * Math.PI * 2;
      return project(Math.cos(angle) * width * .47, Math.sin(angle) * height * .28, z);
    });
    path.setAttribute('d', pathFrom(points));
  });
  axes[0].setAttribute('d', pathFrom([project(-width * .49, 0, 0), project(width * .49, 0, 0)]));
  axes[1].setAttribute('d', pathFrom([project(0, -height * .47, 0), project(0, height * .47, 0)]));
  edges.forEach(({a, b, path}) => {
    const from = geometry.get(a), to = geometry.get(b);
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    const sx = from.x + dx * (from.radius + 4) / length, sy = from.y + dy * (from.radius + 4) / length;
    const ex = to.x - dx * (to.radius + 4) / length, ey = to.y - dy * (to.radius + 4) / length;
    path.setAttribute('d', `M${sx},${sy} Q${(sx+ex)/2-dy*.07},${(sy+ey)/2+dx*.07} ${ex},${ey}`);
    path.toggleAttribute('data-selected', selected === a || selected === b);
    path.style.opacity = selected && !connected.has(a) ? '.14' : '';
  });
}
function frame(time) {
  request = 0;
  if (!active() || document.hidden) return;
  const progress = !motion() || root.dataset.focusModality === 'keyboard' ? 1 : Math.min(1, (time-liftStarted)/duration);
  const amount = progress === 1 ? 1 : ease(progress);
  nodes.forEach(node => { node.lift = (node.fromLift || 0) + ((node.toLift || 0)-(node.fromLift || 0))*amount; });
  draw();
  if (progress < 1) request = requestAnimationFrame(frame);
}
function schedule() { if (!request) request = requestAnimationFrame(frame); }
function sync() {
  if (!active()) {
    cancelAnimationFrame(request); request = 0;
    nodes.forEach(({button, label}) => [button, label].forEach(element => {
      element.style.removeProperty('--spatial-dx'); element.style.removeProperty('--spatial-dy');
      element.style.removeProperty('--spatial-scale'); element.removeAttribute('data-spatial-muted');
    }));
    return;
  }
  const next = document.body.classList.contains('has-point-preview') ? selectedMapId : null;
  if (next !== selected || !motion()) {
    selected = next; liftStarted = performance.now();
    nodes.forEach(node => { node.fromLift = node.lift || 0; node.toLift = node.id === next && motion() ? 48 : 0; });
  }
  measure(); schedule();
}
field.addEventListener('pointerdown', event => {
  if (!motion() || event.button !== 0 || event.target.closest('button,a,.map-node-label')) return;
  drag = { id:event.pointerId, x:event.clientX, y:event.clientY, yaw, pitch, moved:false };
});
field.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) < 7) return;
  if (!drag.moved && event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
  drag.moved = true; field.setPointerCapture(event.pointerId); field.setAttribute('data-dragging','');
  yaw = Math.max(-.5, Math.min(.35, drag.yaw + dx / 420));
  pitch = Math.max(-.42, Math.min(-.1, drag.pitch - dy / 650));
  schedule();
});
const stopDrag = () => { drag = null; field.removeAttribute('data-dragging'); };
field.addEventListener('pointerup', stopDrag); field.addEventListener('pointercancel', stopDrag);
window.addEventListener('map-layout', () => { if (active()) measure(); });
let measureFrame = 0;
new ResizeObserver(() => {
  if (!active() || measureFrame) return;
  measureFrame = requestAnimationFrame(() => { measureFrame = 0; if (active()) measure(); });
}).observe(field);
new MutationObserver(sync).observe(document.body, {attributes:true, attributeFilter:['class']});
reducedMotion.addEventListener('change', sync);
new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:['data-reduce-motion']});
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(request); request = 0; } else sync(); });
compact.addEventListener('change', sync);

const search = document.querySelector('[data-spatial-search]');
const input = document.querySelector('[data-command-input]');
const form = input.closest('form');
search.addEventListener('click', () => { form.removeAttribute('aria-hidden'); input.focus({preventScroll:true}); });
const restoreSearchFocus = () => requestAnimationFrame(() => {
  if (compact.matches && !document.body.matches('.has-command-focus,.has-content-panel,[data-case-open],.has-settings-panel')) search.focus({preventScroll:true});
});
form.querySelector('.command-dock__submit').addEventListener('click', restoreSearchFocus);
input.addEventListener('keydown', event => { if (event.key === 'Escape') restoreSearchFocus(); });
function syncSearch() {
  const open = document.body.classList.contains('has-command-focus');
  form.dataset.materialActive = compact.matches && open ? 'mobile' : 'none';
  search.setAttribute('aria-expanded', String(open));
  input.tabIndex = compact.matches && !open ? -1 : 0;
  if (compact.matches && !open) form.setAttribute('aria-hidden', 'true');
  else form.removeAttribute('aria-hidden');
}
new MutationObserver(syncSearch).observe(document.body, {attributes:true, attributeFilter:['class']});
compact.addEventListener('change', syncSearch);
syncSearch(); sync();
