// A seamless material rotates in spherical coordinates; the CSS light stays fixed.
import { reducedMotion } from "./preferences.js";

const resolution = 160;
const textureWidth = 256;
const textureHeight = 128;
const surfaces = new Map();
const forcedColors = matchMedia("(forced-colors: active)");
// Seed, grain scale, vertical stretch, and broad-grain weight: one material per identity.
const profiles = {
  garage: [7319, 3.7, 1, 0.55],
  optimal: [1931, 12, 1, 0.35],
  ilmix: [5827, 2.4, 1.5, 0.75],
  running: [9137, 5.5, 0.35, 0.65],
  youtube: [4211, 8, 1, 0.75],
};
let projection;
let frame = 0;
let lastTime = 0;

const mix = (a, b, t) => a + (b - a) * t;
const prepareMaterial = (surface) => {
  if (surface.texture) return;
  const [initialSeed, scale, stretch, weight] = profiles[surface.id];
  const lattice = new Float32Array(32 ** 3);
  let seed = initialSeed;
  for (let i = 0; i < lattice.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    lattice[i] = seed / 4294967296;
  }
  const noise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);
    const at = (dx, dy, dz) => lattice[
      ((ix + dx) & 31) + (((iy + dy) & 31) << 5) + (((iz + dz) & 31) << 10)
    ];
    return mix(
      mix(mix(at(0, 0, 0), at(1, 0, 0), sx), mix(at(0, 1, 0), at(1, 1, 0), sx), sy),
      mix(mix(at(0, 0, 1), at(1, 0, 1), sx), mix(at(0, 1, 1), at(1, 1, 1), sx), sy),
      sz,
    );
  };
  const texture = new Float32Array(textureWidth * textureHeight);
  surface.texture = texture;
  for (let y = 0; y < textureHeight; y += 1) {
    const latitude = y / (textureHeight - 1) * Math.PI - Math.PI / 2;
    for (let x = 0; x < textureWidth; x += 1) {
      const longitude = x / textureWidth * Math.PI * 2;
      const nx = Math.sin(longitude) * Math.cos(latitude);
      const ny = Math.sin(latitude);
      const nz = Math.cos(longitude) * Math.cos(latitude);
      const sample = (frequency) => noise(nx * frequency + 16, ny * frequency * stretch + 16, nz * frequency + 16);
      const grain = sample(scale) * weight
        + sample(Math.min(20, scale * 2.54)) * (0.85 - weight) + sample(23.1) * 0.15;
      texture[y * textureWidth + x] = (grain - 0.5) * 2;
    }
  }
  if (projection) return;
  projection = [];
  for (let py = 0; py < resolution; py += 1) {
    for (let px = 0; px < resolution; px += 1) {
      const x = (px + 0.5) / resolution * 2 - 1;
      const y = (py + 0.5) / resolution * 2 - 1;
      if (x * x + y * y >= 1) continue;
      const z = Math.sqrt(1 - x * x - y * y);
      const v = (Math.asin(y) / Math.PI + 0.5) * (textureHeight - 1);
      projection.push({
        offset: (py * resolution + px) * 4,
        u: Math.atan2(x, z) / (Math.PI * 2) * textureWidth,
        row: Math.floor(v) * textureWidth,
        blend: v % 1,
        light: Math.max(0.12, -0.44 * x - 0.6 * y + 0.67 * z) * z ** 0.35,
      });
    }
  }
};

const paint = (surface) => {
  const pixels = surface.image.data;
  const texture = surface.texture;
  const shift = surface.turn * textureWidth;
  for (const point of projection) {
    const u = point.u - shift + textureWidth * 2; // Features travel right across the visible face.
    const x = Math.floor(u) & (textureWidth - 1);
    const next = (x + 1) & (textureWidth - 1);
    const top = mix(texture[point.row + x], texture[point.row + next], u % 1);
    const bottom = mix(texture[point.row + textureWidth + x], texture[point.row + textureWidth + next], u % 1);
    const grain = mix(top, bottom, point.blend);
    const color = grain > 0 ? 255 : 0;
    pixels[point.offset] = color;
    pixels[point.offset + 1] = color;
    pixels[point.offset + 2] = color;
    pixels[point.offset + 3] = Math.abs(grain) * 56 * point.light;
  }
  surface.context.putImageData(surface.image, 0, 0);
};

const allowed = () => !document.hidden && !reducedMotion.matches && !forcedColors.matches;
const active = (surface) => surface.visible
  && surface.canvas.closest("[data-map-id]")?.getAttribute("aria-hidden") !== "true";
const tick = (time) => {
  frame = 0;
  if (!allowed()) return;
  const visible = [...surfaces.values()].filter(active);
  if (!visible.length) return;
  if (!lastTime || time - lastTime >= 1000 / 24) {
    const elapsed = lastTime ? Math.min(100, time - lastTime) / 1000 : 0;
    lastTime = time;
    for (const surface of visible) {
      prepareMaterial(surface);
      surface.turn = (surface.turn + elapsed / surface.seconds) % 1;
      paint(surface);
    }
  }
  frame = requestAnimationFrame(tick);
};
const sync = () => {
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = 0;
  let running = false;
  for (const surface of surfaces.values()) {
    const animate = allowed() && active(surface);
    surface.canvas.dataset.sphereMotion = animate ? "running" : "paused";
    running ||= animate;
  }
  if (running) frame = requestAnimationFrame(tick);
};
const visibility = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const surface = surfaces.get(entry.target);
    if (surface) surface.visible = entry.isIntersecting;
  }
  sync();
});
const nodes = document.querySelector("[data-map-nodes]");
if (nodes) {
  new MutationObserver(sync).observe(nodes, {
    subtree: true, attributes: true, attributeFilter: ["aria-hidden"],
  });
}
reducedMotion.addEventListener("change", sync);
forcedColors.addEventListener("change", sync);
document.addEventListener("visibilitychange", sync);
window.addEventListener("pagehide", () => cancelAnimationFrame(frame));
window.addEventListener("pageshow", sync);

export const createSphereSurface = (id, seconds, phase) => {
  const canvas = document.createElement("canvas");
  canvas.className = "map-node__surface";
  canvas.width = canvas.height = resolution;
  const context = canvas.getContext("2d");
  if (context) {
    surfaces.set(canvas, {
      id, canvas, context, seconds, visible: false, turn: phase % 1,
      image: context.createImageData(resolution, resolution),
    });
    visibility.observe(canvas);
  }
  return canvas;
};
