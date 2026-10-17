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
const relationSvg = document.createElementNS(ns, 'svg');
relationSvg.classList.add('spatial-field', 'spatial-field--relations'); relationSvg.setAttribute('aria-hidden', 'true');
field.prepend(svg, relationSvg);
const makePath = (name, layer = svg) => {
  const path = document.createElementNS(ns, 'path'); path.setAttribute('class', name); layer.append(path); return path;
};
const orbits = [-95, 0, 95].map((z, i) => ({ z, path: makePath(`spatial-orbit${i === 0 ? ' spatial-orbit--back' : ''}`) }));
const axes = [makePath('spatial-axis'), makePath('spatial-axis')];
const edges = relationships.map(([a, b]) => {
  const path = makePath('spatial-relation', relationSvg);
  path.dataset.relationKey = `${a}:${b}`;
  return { a, b, path, points: [] };
});
const restYaw = -.16, restPitch = -.26, cameraDistance = 760;
let width = 1, height = 1, request = 0;
let yaw = restYaw, pitch = restPitch, selected = null, drag = null;
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
  const scale = cameraDistance / (cameraDistance - z2);
  return { x: x1 * scale + width / 2, y: y1 * scale + height / 2, z: z2, viewX: x1, viewY: y1, scale };
};
const unrotate = (x, y, z, turn = yaw, tilt = pitch) => {
  const y1 = y * Math.cos(tilt) + z * Math.sin(tilt);
  const z1 = -y * Math.sin(tilt) + z * Math.cos(tilt);
  return { x: x * Math.cos(turn) - z1 * Math.sin(turn), y: y1,
    z: x * Math.sin(turn) + z1 * Math.cos(turn) };
};
// Intersect a viewing ray with a world-depth plane. This preserves the accepted
// resting composition while giving every point of a connection a fixed 3D home.
const unproject = (x, y, z) => {
  const origin = unrotate(0, 0, cameraDistance, restYaw, restPitch);
  const ray = unrotate((x - width / 2) / cameraDistance,
    (y - height / 2) / cameraDistance, -1, restYaw, restPitch);
  const distance = (z - origin.z) / ray.z;
  return { x: origin.x + ray.x * distance, y: origin.y + ray.y * distance, z };
};
const interpolate = (a, b, t) => ({ x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const pathFrom = (points, geometry, endpoints = []) => {
  const visible = point => !geometry.some(node => {
    const distanceSquared = (point.x - node.x) ** 2 + (point.y - node.y) ** 2;
    // A small breathing space at the two anchors belongs to the connection;
    // other nodes occlude only the parts actually behind their front surface.
    if (endpoints.includes(node.id)) return distanceSquared < (node.radius + 4) ** 2;
    if (distanceSquared >= node.radius ** 2) return false;
    const surface = node.z + Math.sqrt(node.radius ** 2 - distanceSquared) / node.viewScale;
    return point.z < surface;
  });
  const command = (letter, point) => `${letter}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  let result = '', previous = null, wasVisible = false;
  for (const point of points) {
    const isVisible = visible(point);
    if (previous && isVisible !== wasVisible) {
      let low = previous, high = point;
      // Resolve the silhouette between samples rather than letting a line's
      // end jump by a whole segment as a sphere passes in front of it.
      for (let i = 0; i < 8; i++) {
        const middle = interpolate(low, high, .5);
        if (visible(middle) === wasVisible) low = middle; else high = middle;
      }
      result += command(wasVisible ? 'L' : 'M', interpolate(low, high, .5));
    }
    if (isVisible) result += command(previous ? 'L' : 'M', point);
    previous = point; wasVisible = isVisible;
  }
  return result;
};
function measure() {
  width = field.clientWidth; height = field.clientHeight;
  for (const layer of [svg, relationSvg]) layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const node of nodes) {
    node.baseX = parseFloat(node.button.style.getPropertyValue('--x')) * width / 100;
    node.baseY = parseFloat(node.button.style.getPropertyValue('--y')) * height / 100;
    node.radius = node.glyph.offsetWidth / 2;
    const point = unproject(node.baseX, node.baseY, node.z);
    node.x = point.x; node.y = point.y;
    node.restScale = project(point.x, point.y, node.z, restYaw, restPitch).scale;
  }
  edges.forEach(edge => {
    const from = nodes.find(node => node.id === edge.a), to = nodes.find(node => node.id === edge.b);
    const dx = to.baseX - from.baseX, dy = to.baseY - from.baseY;
    const length = Math.hypot(dx, dy), archDepth = Math.min(48, length * .2);
    const start = (from.radius + 4) / length, end = 1 - (to.radius + 4) / length;
    edge.points = Array.from({ length: 81 }, (_, i) => {
      const t = i / 80, arch = 4 * t * (1 - t);
      // Extend the existing edge-to-edge arc inside the two nodes. Its visible
      // silhouette is unchanged at rest; clipping finds the new exits on turn.
      const u = (t - start) / Math.max(.1, end - start), bend = .14 * u * (1 - u);
      return { ...unproject(from.baseX + dx * t - dy * bend,
        from.baseY + dy * t + dx * bend,
        from.z + (to.z - from.z) * t + archDepth * arch), t };
    });
  });
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
    const distance = cameraDistance / point.scale, lift = node.lift || 0;
    const viewScale = cameraDistance / (distance - lift);
    const scale = viewScale / node.restScale;
    node.liftOffset = unrotate(-point.viewX * lift / distance, -point.viewY * lift / distance, lift);
    for (const element of [node.button, node.label]) {
      element.style.setProperty('--spatial-dx', `${dx.toFixed(2)}px`);
      element.style.setProperty('--spatial-dy', `${dy.toFixed(2)}px`);
      element.toggleAttribute('data-spatial-muted', Boolean(selected) && !connected.has(node.id));
      element.toggleAttribute('data-spatial-selected', chosen);
    }
    node.button.style.setProperty('--spatial-scale', scale.toFixed(4));
    geometry.set(node.id, {...point, id: node.id, z: point.z + lift, viewScale, radius:node.radius * scale});
  }
  const occluders = [...geometry.values()];
  [...nodes].sort((a, b) => geometry.get(a.id).z - geometry.get(b.id).z)
    .forEach((node, index) => { node.button.style.zIndex = String(index + 1); });
  orbits.forEach(({z, path}) => {
    const points = Array.from({length:161}, (_, i) => {
      const angle = i / 160 * Math.PI * 2;
      return project(Math.cos(angle) * width * .47, Math.sin(angle) * height * .28, z);
    });
    path.setAttribute('d', pathFrom(points, occluders));
  });
  axes.forEach((path, axis) => path.setAttribute('d', pathFrom(Array.from({length:81}, (_, i) => {
    const t = i / 80 * 2 - 1;
    return project(axis ? 0 : t * width * .49, axis ? t * height * .47 : 0, 0);
  }), occluders)));
  edges.forEach(({a, b, path, points}) => {
    const from = nodes.find(node => node.id === a).liftOffset, to = nodes.find(node => node.id === b).liftOffset;
    const projected = points.map(point => {
      const offset = interpolate(from, to, point.t);
      return project(point.x + offset.x, point.y + offset.y, point.z + offset.z);
    });
    path.setAttribute('d', pathFrom(projected, occluders, [a, b]));
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
      element.style.removeProperty('z-index');
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
