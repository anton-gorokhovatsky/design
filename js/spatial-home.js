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
let yaw = restYaw, pitch = restPitch, selected = null, drag = null, coast = null;
let clearView = null;
let liftStarted = 0;
const duration = 200;
const coastDecay = duration / 2, coastDuration = 300;
const clampYaw = value => Math.max(-.5, Math.min(.35, value));
const clampPitch = value => Math.max(-.42, Math.min(-.1, value));
const clampSpeed = value => Math.max(-.08 / coastDecay, Math.min(.08 / coastDecay, value));
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
    node.heading = Boolean(node.label.querySelector('small'));
    const transform = new DOMMatrixReadOnly(getComputedStyle(node.label).transform);
    node.labelBox = { width: node.label.offsetWidth, height: node.label.offsetHeight,
      x: node.label.offsetLeft + transform.m41 - node.baseX,
      y: node.label.offsetTop + transform.m42 - node.baseY };
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
function placeLabels(geometry) {
  const overlaps = (a, b, gap = 6) => a.left < b.right + gap && a.right > b.left - gap
    && a.top < b.bottom + gap && a.bottom > b.top - gap;
  const points = [...geometry.values()];
  // Area headings keep their authored positions first. A bounded joint search
  // can nudge an earlier caption when that gives every neighbour a legal slot.
  const ordered = [...nodes].sort((a, b) => Number(b.heading) - Number(a.heading));
  const choices = ordered.map(node => {
    const point = geometry.get(node.id), size = node.labelBox;
    const home = [point.x + size.x, point.y + size.y], gap = point.radius + 8;
    const anchors = { home,
      north: [point.x - size.width / 2, point.y - gap - size.height],
      south: [point.x - size.width / 2, point.y + gap],
      west: [point.x - gap - size.width, point.y - size.height / 2],
      east: [point.x + gap, point.y - size.height / 2],
      northeast: [point.x + gap, point.y - gap - size.height],
      northwest: [point.x - gap - size.width, point.y - gap - size.height],
      southeast: [point.x + gap, point.y + gap],
      southwest: [point.x - gap - size.width, point.y + gap] };
    const candidates = [], seen = new Set();
    for (const [side, [x, y]] of Object.entries(anchors)) {
      for (const shift of side.length > 5 ? [0] : [0, -12, 12, -24, 24]) for (const rise of side === 'home' || side.length > 5 ? [0, -6, 6] : [0]) {
        const vertical = side === 'west' || side === 'east';
        const left = Math.max(0, Math.min(width - size.width, x + (vertical ? 0 : shift)));
        const top = Math.max(0, Math.min(height - size.height, y + (vertical ? shift : rise)));
        const box = { left, right: left + size.width, top, bottom: top + size.height };
        const key = `${side}:${shift}:${rise}`, position = `${left.toFixed(2)},${top.toFixed(2)}`;
        if (seen.has(position) || box.right > width || box.bottom > height) continue;
        seen.add(position);
        if (points.some(other => {
          const dx = other.x - Math.max(box.left, Math.min(box.right, other.x));
          const dy = other.y - Math.max(box.top, Math.min(box.bottom, other.y));
          return dx * dx + dy * dy < (other.radius + 4) ** 2;
        })) continue;
        candidates.push({ ...box, key, node, dx: left - home[0], dy: top - home[1] });
      }
    }
    // Retain a valid side during a gesture instead of oscillating at a boundary.
    candidates.sort((a, b) => Number(b.key === node.labelPlacement) - Number(a.key === node.labelPlacement));
    return candidates;
  });
  let remaining = 2000, best = [];
  for (const candidates of choices) {
    const candidate = candidates.find(box => !best.some(other => overlaps(box, other)));
    if (candidate) best.push(candidate);
  }
  const score = placed => placed.length + nodes.length * placed.filter(box => box.node.heading).length;
  function fit(pending, placed) {
    if (score(placed) > score(best)) best = [...placed];
    if (!pending.length) return placed.length === ordered.length;
    if (--remaining < 0) return false;
    const next = pending.map(index => ({ index, candidates: choices[index]
      .filter(box => !placed.some(other => overlaps(box, other))) }))
      .sort((a, b) => a.candidates.length - b.candidates.length)[0];
    const rest = pending.filter(index => index !== next.index);
    for (const candidate of next.candidates) {
      if (fit(rest, [...placed, candidate])) return true;
    }
    return false;
  }
  if (best.length < ordered.length) fit(ordered.map((_, index) => index), []);
  for (const node of nodes) node.label.toggleAttribute('data-spatial-no-space', !best.some(box => box.node === node));
  for (const box of best) {
    box.node.labelPlacement = box.key;
    box.node.label.style.setProperty('--spatial-label-dx', `${box.dx.toFixed(2)}px`);
    box.node.label.style.setProperty('--spatial-label-dy', `${box.dy.toFixed(2)}px`);
  }
  return best.length === nodes.length;
}
function draw(restoring = false) {
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
  const labelsFit = placeLabels(geometry);
  if (!labelsFit && !restoring) {
    const previous = clearView?.width === width && clearView.height === height
      ? clearView : { yaw: restYaw, pitch: restPitch };
    if (previous.yaw !== yaw || previous.pitch !== pitch) {
      // A compact map cannot rotate into an unreadable arrangement. Stop at
      // its last clear view before painting, retaining all eight captions.
      yaw = previous.yaw; pitch = previous.pitch; coast = null;
      draw(true);
      return;
    }
  }
  if (labelsFit) clearView = { yaw, pitch, width, height };
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
  if (coast) {
    // Integrate exponential friction exactly: equal travel at 60 and 120 Hz,
    // no spring target, rebound or return to the resting angle.
    const elapsed = Math.min(coastDuration, time - coast.started);
    const travel = coastDecay * (1 - Math.exp(-elapsed / coastDecay));
    yaw = clampYaw(coast.yaw + coast.yawSpeed * travel);
    pitch = clampPitch(coast.pitch + coast.pitchSpeed * travel);
    if (elapsed === coastDuration) coast = null;
  }
  const progress = !motion() || root.dataset.focusModality === 'keyboard' ? 1 : Math.min(1, (time-liftStarted)/duration);
  const amount = progress === 1 ? 1 : ease(progress);
  nodes.forEach(node => { node.lift = (node.fromLift || 0) + ((node.toLift || 0)-(node.fromLift || 0))*amount; });
  draw();
  if (progress < 1 || coast) request = requestAnimationFrame(frame);
}
function schedule() { if (!request) request = requestAnimationFrame(frame); }
function stopMotion() {
  coast = null;
  const pointerId = drag?.id;
  drag = null;
  field.removeAttribute('data-dragging');
  if (pointerId !== undefined && field.hasPointerCapture(pointerId)) field.releasePointerCapture(pointerId);
}
function sync() {
  if (!active() || !motion() || document.body.matches('.has-reading-surface,.has-command-focus,.has-point-preview')) stopMotion();
  if (!active()) {
    cancelAnimationFrame(request); request = 0;
    nodes.forEach(({button, label}) => [button, label].forEach(element => {
      element.style.removeProperty('--spatial-dx'); element.style.removeProperty('--spatial-dy');
      element.style.removeProperty('--spatial-scale'); element.removeAttribute('data-spatial-muted');
      element.style.removeProperty('--spatial-label-dx'); element.style.removeProperty('--spatial-label-dy');
      element.removeAttribute('data-spatial-no-space');
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
  stopMotion();
  if (!active() || !motion() || event.button !== 0 || event.target.closest('button,a,.map-node-label')) return;
  drag = { id:event.pointerId, x:event.clientX, y:event.clientY, yaw, pitch, moved:false,
    time:performance.now(), yawSpeed:0, pitchSpeed:0 };
});
field.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) < 7) return;
  if (!drag.moved && event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
  drag.moved = true; field.setPointerCapture(event.pointerId); field.setAttribute('data-dragging','');
  const now = performance.now(), delta = Math.max(8, now - drag.time);
  const nextYaw = clampYaw(drag.yaw + dx / 420), nextPitch = clampPitch(drag.pitch - dy / 650);
  const velocity = (previous, movement) => {
    const sample = clampSpeed(movement / delta);
    if (delta > 80 || Math.sign(previous) !== Math.sign(sample)) previous = 0;
    return previous + (sample - previous) * .42;
  };
  drag.yawSpeed = velocity(drag.yawSpeed, nextYaw - yaw);
  drag.pitchSpeed = velocity(drag.pitchSpeed, nextPitch - pitch);
  drag.time = now;
  yaw = nextYaw; pitch = nextPitch;
  schedule();
});
field.addEventListener('pointerup', event => {
  if (!drag || drag.id !== event.pointerId) return;
  const now = performance.now();
  const release = drag.moved && now - drag.time < 80 && motion()
    ? { yaw, pitch, yawSpeed:drag.yawSpeed, pitchSpeed:drag.pitchSpeed, started:now } : null;
  stopMotion();
  coast = release;
  if (coast) schedule();
});
field.addEventListener('pointercancel', stopMotion);
field.addEventListener('lostpointercapture', () => { if (drag) stopMotion(); });
document.addEventListener('keydown', stopMotion, true);
window.addEventListener('map-layout', () => { if (active()) measure(); });
let measureFrame = 0;
new ResizeObserver(() => {
  if (!active() || measureFrame) return;
  measureFrame = requestAnimationFrame(() => { measureFrame = 0; if (active()) measure(); });
}).observe(field);
new MutationObserver(sync).observe(document.body, {attributes:true, attributeFilter:['class']});
reducedMotion.addEventListener('change', sync);
new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:['data-reduce-motion']});
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopMotion(); cancelAnimationFrame(request); request = 0; } else sync(); });
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
