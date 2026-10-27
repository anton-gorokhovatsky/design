import {pane} from './pane-viewport.js';
import { getMapCoreRadius, mapButtons, selectedMapId, syncMapAtmospherePosition } from './map-engine.js';
import { reducedMotion } from './preferences.js';

const field = document.querySelector('.focused-home__map');
const root = document.documentElement;
const compact = pane.media('(max-width: 900px)');
const forcedColors = matchMedia('(forced-colors:active)');
const ns = 'http://www.w3.org/2000/svg';
// Depth groups follow the existing map's branches, not an importance ranking.
const depths = new Map([
  ['garage', -56], ['narkomfin', -56],
  ['private-practice', 0],
  ['principle-data-intuition', 0], ['running', 56], ['youtube', 56],
]);
const relationships = [['garage', 'narkomfin']];
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
let suppressPointerClick = false;
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
  let reflow = width !== field.clientWidth || height !== field.clientHeight;
  width = field.clientWidth; height = field.clientHeight;
  const fieldScale = field.getBoundingClientRect().width / width || 1;
  for (const layer of [svg, relationSvg]) layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const node of nodes) {
    const x = parseFloat(node.button.style.getPropertyValue('--x')) * width / 100;
    const y = parseFloat(node.button.style.getPropertyValue('--y')) * height / 100;
    reflow ||= node.baseX !== x || node.baseY !== y;
    node.baseX = x; node.baseY = y;
    // Measure the painted core, excluding transparent beams, glow and orbits.
    const spatialScale = parseFloat(node.button.style.getPropertyValue('--spatial-scale')) || 1;
    node.fixedCore = !forcedColors.matches && Boolean(node.glyph.querySelector('.practice-orbits-canvas')?.getBoundingClientRect().width);
    node.radius = getMapCoreRadius(node.glyph) / fieldScale / (node.fixedCore ? 1 : spatialScale);
    // Preserve the accepted caption clearance independently of line occlusion.
    const labelRadius = node.glyph.offsetWidth / 2;
    node.rx = node.id === 'private-practice' ? node.glyph.offsetWidth * .46 + 8 : labelRadius + 2;
    node.ry = node.id === 'private-practice' ? node.glyph.offsetWidth * .34 + 8 : labelRadius + 2;
    const transform = new DOMMatrixReadOnly(getComputedStyle(node.label).transform);
    const box = { width: node.label.offsetWidth, height: node.label.offsetHeight,
      x: node.label.offsetLeft + transform.m41 - node.baseX,
      y: node.label.offsetTop + transform.m42 - node.baseY };
    reflow ||= Object.keys(box).some(key => box[key] !== node.labelBox?.[key]);
    node.labelBox = box;
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
  if (reflow) nodes.forEach(node => { node.labelPosition = null; });
  draw();
}
const nearAnchor = (left, top, boxWidth, boxHeight, point) => Math.hypot(
  Math.max(0, left - point.x - point.rx, point.x - point.rx - left - boxWidth),
  Math.max(0, top - point.y - point.ry, point.y - point.ry - top - boxHeight),
) <= 24;
function seedLabels(geometry) {
  const gap = 4, points = [...geometry.values()];
  const overlaps = (a, b) => a.left < b.right + gap && a.right > b.left - gap
    && a.top < b.bottom + gap && a.bottom > b.top - gap;
  const choices = nodes.map(node => {
    const point = geometry.get(node.id), size = node.labelBox, old = node.labelPosition;
    const home = { x: node.baseX + (point.x - node.baseX) * .45 + size.x,
      y: node.baseY + (point.y - node.baseY) * .45 + size.y };
    const target = old ? { x: old.x + (point.x - old.px) * .45 - size.width / 2,
      y: old.y + (point.y - old.py) * .45 - size.height / 2 } : home;
    if (old) { target.x = (target.x + home.x) / 2; target.y = (target.y + home.y) / 2; }
    const xs = [target.x, home.x, 0, width - size.width];
    const ys = [target.y, home.y, 0, height - size.height];
    for (const p of points) {
      const rx = Math.max(p.rx, 13) + gap, ry = Math.max(p.ry, 13) + gap;
      xs.push(p.x - rx - size.width, p.x + rx);
      ys.push(p.y - ry - size.height, p.y + ry);
    }
    for (const other of nodes) if (other.labelPosition) {
      const p = other.labelPosition, s = other.labelBox;
      xs.push(p.x - s.width / 2 - gap - size.width, p.x + s.width / 2 + gap);
      ys.push(p.y - s.height / 2 - gap - size.height, p.y + s.height / 2 + gap);
    }
    for (let x = 0; x < width - size.width; x += 16) xs.push(x);
    for (let y = 0; y < height - size.height; y += 16) ys.push(y);
    const candidates = [], seen = new Set();
    for (const x of xs) for (const y of ys) {
      const left = Math.max(0, Math.min(width - size.width, x));
      const top = Math.max(0, Math.min(height - size.height, y));
      const box = { left, right: left + size.width, top, bottom: top + size.height, node };
      if (!nearAnchor(left, top, size.width, size.height, point)) continue;
      const key = `${left.toFixed(2)},${top.toFixed(2)}`;
      if (seen.has(key) || box.right > width || box.bottom > height) continue;
      seen.add(key);
      if (points.some(p => {
        const dx = p.x - Math.max(box.left, Math.min(box.right, p.x));
        const dy = p.y - Math.max(box.top, Math.min(box.bottom, p.y));
        return Math.hypot(dx / p.rx, dy / p.ry) < 1
          || (node.id !== p.id && box.left < p.x + 15 && box.right > p.x - 15 && box.top < p.y + 15 && box.bottom > p.y - 15);
      })) continue;
      box.cost = (left - target.x) ** 2 + (top - target.y) ** 2;
      candidates.push(box);
    }
    return candidates.sort((a, b) => a.cost - b.cost);
  });
  // Prefer nearby slots; widen only when neighbours cannot all fit.
  let solution;
  for (const limit of [64, 256, 1024, 4096, Infinity]) {
    let remaining = 2000;
    const allowed = choices.map(candidates => candidates.filter(box => box.cost <= limit));
    function fit(pending, placed) {
      if (!pending.length) { solution = placed; return true; }
      if (--remaining < 0) return false;
      const next = pending.map(index => ({ index, candidates: allowed[index]
        .filter(box => !placed.some(other => overlaps(box, other))) }))
        .sort((a, b) => a.candidates.length - b.candidates.length)[0];
      const rest = pending.filter(index => index !== next.index), tried = [];
      for (const box of next.candidates) {
        if (tried.some(other => Math.abs(other.left - box.left) < 8 && Math.abs(other.top - box.top) < 8)) continue;
        tried.push(box);
        if (fit(rest, [...placed, box])) return true;
      }
      return false;
    }
    if (fit(nodes.map((_, index) => index), [])) break;
  }
  if (!solution) return false;
  for (const box of solution) {
    const point = geometry.get(box.node.id);
    box.node.labelPosition = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2,
      px: point.x, py: point.y };
  }
  return true;
}
function placeLabels(geometry) {
  if (nodes.every(node => !node.labelPosition)) seedLabels(geometry);
  const items = nodes.map(node => {
    const point = geometry.get(node.id), size = node.labelBox, old = node.labelPosition;
    const homeX = node.baseX + (point.x - node.baseX) * .45 + size.x + size.width / 2;
    const homeY = node.baseY + (point.y - node.baseY) * .45 + size.y + size.height / 2;
    return { node, w: size.width / 2, h: size.height / 2, px: point.x, py: point.y,
      x: old ? (old.x + (point.x - old.px) * .45) * .88 + homeX * .12 : homeX,
      y: old ? (old.y + (point.y - old.py) * .45) * .88 + homeY * .12 : homeY };
  });
  const contain = box => {
    box.x = Math.max(box.w, Math.min(width - box.w, box.x));
    box.y = Math.max(box.h, Math.min(height - box.h, box.y));
  };
  items.forEach(contain);
  // Resolve only caption positions. Camera angles and momentum are independent.
  for (let pass = 0; pass < 160; pass++) {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j], dx = b.x - a.x, dy = b.y - a.y;
      const ox = a.w + b.w + 4 - Math.abs(dx), oy = a.h + b.h + 4 - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) { const push = (ox + .01) * Math.sign(dx || 1) / 2; a.x -= push; b.x += push; }
      else { const push = (oy + .01) * Math.sign(dy || 1) / 2; a.y -= push; b.y += push; }
      contain(a); contain(b);
    }
    for (const box of items) for (const point of geometry.values()) {
      // Keep foreign 26px targets clear. The label itself activates its own point.
      const tx = box.w + 15 - Math.abs(box.x - point.x), ty = box.h + 15 - Math.abs(box.y - point.y);
      if (box.node.id !== point.id && tx > 0 && ty > 0) {
        if (tx < ty) box.x += tx * Math.sign(box.x - point.x || 1);
        else box.y += ty * Math.sign(box.y - point.y || 1);
        contain(box);
      }
      const dx = box.x + Math.max(-box.w, Math.min(box.w, point.x - box.x)) - point.x;
      const dy = box.y + Math.max(-box.h, Math.min(box.h, point.y - box.y)) - point.y;
      const distance = Math.hypot(dx / point.rx, dy / point.ry);
      if (distance >= 1) continue;
      if (distance) { box.x += dx * (1 / distance - 1 + .001); box.y += dy * (1 / distance - 1 + .001); }
      else {
        const ox = box.w + point.rx - Math.abs(box.x - point.x), oy = box.h + point.ry - Math.abs(box.y - point.y);
        if (ox < oy) box.x += ox * Math.sign(box.x - point.x || 1);
        else box.y += oy * Math.sign(box.y - point.y || 1);
      }
      contain(box);
    }
  }
  // Local separation can get trapped between a sphere and a neighbouring
  // caption. Reassign nearby free slots instead of stopping the camera.
  const crowded = items.some((a, i) => items.slice(i + 1).some(b =>
    Math.abs(a.x - b.x) < a.w + b.w + 1 && Math.abs(a.y - b.y) < a.h + b.h + 1))
    || items.some(b => !nearAnchor(b.x - b.w, b.y - b.h, b.w * 2, b.h * 2, geometry.get(b.node.id)))
    || items.some(b => [...geometry.values()].some(p => Math.hypot(
      Math.max(0, Math.abs(b.x - p.x) - b.w) / p.rx, Math.max(0, Math.abs(b.y - p.y) - b.h) / p.ry)
      < .999 || (b.node.id !== p.id && Math.abs(b.x - p.x) < b.w + 14 && Math.abs(b.y - p.y) < b.h + 14)));
  if (crowded && seedLabels(geometry)) for (const box of items) {
    box.x = box.node.labelPosition.x; box.y = box.node.labelPosition.y;
  }
  for (const box of items) {
    box.node.labelPosition = { x: box.x, y: box.y, px: box.px, py: box.py };
    box.node.label.style.setProperty('--spatial-label-dx', `${(box.x - box.w - box.px - box.node.labelBox.x).toFixed(2)}px`);
    box.node.label.style.setProperty('--spatial-label-dy', `${(box.y - box.h - box.py - box.node.labelBox.y).toFixed(2)}px`);
  }
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
    geometry.set(node.id, {...point, id: node.id, z: point.z + lift, viewScale,
      radius:node.radius * (node.fixedCore ? 1 : scale), rx:node.rx * scale, ry:node.ry * scale});
  }
  placeLabels(geometry);
  syncMapAtmospherePosition();
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
    // Extend the floor axis beneath the transparent navigation, without
    // enlarging the area used to position nodes or receive rotation gestures.
    return project(axis ? 0 : t * width * .49, axis ? t * (t > 0 ? height * 2 + 128 : height * .47) : 0, 0);
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
  const pointerId = drag?.touch ? undefined : drag?.id;
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
function beginDrag(id, x, y, touch = false) {
  stopMotion();
  suppressPointerClick = false;
  if (!active() || !motion()
    || document.body.matches('.has-reading-surface,.has-command-focus,.has-point-preview')) return;
  // A tap still selects its node; a swipe can start on its label or transparent
  // orbit hit area as well as the background. Capture only after the threshold.
  drag = { id, x, y, touch, yaw, pitch, moved:false,
    time:performance.now(), yawSpeed:0, pitchSpeed:0 };
}
function moveDrag(x, y) {
  const dx = x - drag.x, dy = y - drag.y;
  if (!drag.moved && Math.abs(dx) < 7) return false;
  if (!drag.moved && drag.touch && Math.abs(dy) > Math.abs(dx)) { drag = null; return false; }
  drag.moved = true; field.setAttribute('data-dragging','');
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
  return true;
}
function endDrag() {
  const now = performance.now();
  suppressPointerClick = drag.moved;
  const release = drag.moved && now - drag.time < 80 && motion()
    ? { yaw, pitch, yawSpeed:drag.yawSpeed, pitchSpeed:drag.pitchSpeed, started:now } : null;
  stopMotion();
  coast = release;
  if (coast) schedule();
}
field.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' && event.button === 0 && event.isPrimary)
    beginDrag(event.pointerId, event.clientX, event.clientY);
});
field.addEventListener('pointermove', event => {
  if (!drag || drag.touch || drag.id !== event.pointerId) return;
  if (moveDrag(event.clientX, event.clientY) && !field.hasPointerCapture(event.pointerId))
    field.setPointerCapture(event.pointerId);
});
field.addEventListener('pointerup', event => {
  if (drag && !drag.touch && drag.id === event.pointerId) endDrag();
});
// Keep a finger's stream attached to its original target on iOS. Only an
// accepted horizontal drag prevents native scrolling; vertical gestures pass.
field.addEventListener('touchstart', event => {
  if (event.touches.length !== 1) { stopMotion(); return; }
  const touch = event.touches[0];
  beginDrag(touch.identifier, touch.clientX, touch.clientY, true);
}, { passive: true });
field.addEventListener('touchmove', event => {
  if (!drag?.touch) return;
  const touch = [...event.touches].find(touch => touch.identifier === drag.id);
  if (touch && moveDrag(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
}, { passive: false });
field.addEventListener('touchend', event => {
  if (drag?.touch && [...event.changedTouches].some(touch => touch.identifier === drag.id)) endDrag();
});
field.addEventListener('touchcancel', () => {
  if (drag?.touch) stopMotion();
});
field.addEventListener('click', event => {
  if (!suppressPointerClick || event.detail === 0) return;
  suppressPointerClick = false;
  event.preventDefault(); event.stopImmediatePropagation();
}, true);
field.addEventListener('pointercancel', () => { if (!drag?.touch) stopMotion(); });
field.addEventListener('lostpointercapture', event => {
  // Touch initially belongs to the child under the finger. Transferring that
  // implicit capture to the field must not be mistaken for losing the gesture.
  if (!drag?.touch && event.target === field && drag?.id === event.pointerId) stopMotion();
});
document.addEventListener('keydown', stopMotion, true);
window.addEventListener('map-layout', () => { if (active()) measure(); });
let measureFrame = 0;
new ResizeObserver(() => {
  if (!active() || measureFrame) return;
  measureFrame = requestAnimationFrame(() => { measureFrame = 0; if (active()) measure(); });
}).observe(field);
new MutationObserver(sync).observe(document.body, {attributes:true, attributeFilter:['class']});
reducedMotion.addEventListener('change', sync);
new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:['data-reduce-motion','data-celestial-volume']});
// The asynchronous renderer changes the solid silhouette, never its hit target.
new MutationObserver(sync).observe(mapButtons.get('garage'), {attributes:true, attributeFilter:['data-gravity-ready']});
forcedColors.addEventListener('change', sync);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopMotion(); cancelAnimationFrame(request); request = 0; } else sync(); });
window.addEventListener('pageshow', sync);
compact.addEventListener('change', sync);
document.fonts.ready.then(() => { if (active()) measure(); });

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
