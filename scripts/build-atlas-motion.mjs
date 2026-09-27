// Retain Atlas's exported movement, not a second terrain/noise algorithm.
// Decode its fixed character grid into compact vector frames for both surfaces.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = 'assets/observation/atlas-loop.mp4';
const palette = ['ecece8', 'd9dbe0', 'b5bbd4', '858eb9', '5e6bd0', '3c48c0', '23337f', '152151']
  .map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
const width = 1200, height = 674, columns = 110, rows = 37;
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 200 * 1024 * 1024 });
const timing = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'frame=best_effort_timestamp_time:format=duration', '-of', 'json', source]));
const frames = raw.length / (width * height * 3);
const svg = readFileSync('assets/observation/atlas.svg', 'utf8');
const labels = new Uint8Array(columns * rows);
const symbols = [' ', '·', ':', '+', '×'];
for (const [row, match] of [...svg.matchAll(/<text\s[^>]+>(.*?)<\/text>/g)].entries()) {
  for (const cell of match[1].matchAll(/<tspan x="([^"]+)"[^>]*>(.*?)<\/tspan>/g)) {
    labels[row * columns + Math.floor(Number(cell[1]) / (2400 / columns))] = symbols.indexOf(cell[2]);
  }
}
const pixel = (frame, x, y, channel) => raw[((frame * height + Math.max(0, Math.min(height - 1, y))) * width + Math.max(0, Math.min(width - 1, x))) * 3 + channel];
function cell(frame, column, row) {
  const x = (column + .5) * width / columns, y = (row + .5) * height / rows;
  const bg = [0, 1, 2].map(c => pixel(frame, Math.floor(x - 4), Math.floor(y - 7), c));
  const level = palette.map(p => p.reduce((sum, v, c) => sum + (v - bg[c]) ** 2, 0))
    .reduce((best, error, i, all) => error < all[best] ? i : best, 0);
  const fg = palette[level >= 4 ? 0 : 7];
  const patch = [];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -4; dx <= 4; dx++) {
    const xx = x + dx, yy = y + dy - .5, ix = Math.floor(xx), iy = Math.floor(yy);
    const tx = xx - ix, ty = yy - iy;
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) {
      const value = pixel(frame, ix, iy, c) * (1 - tx) * (1 - ty) + pixel(frame, ix + 1, iy, c) * tx * (1 - ty)
        + pixel(frame, ix, iy + 1, c) * (1 - tx) * ty + pixel(frame, ix + 1, iy + 1, c) * tx * ty;
      numerator += (value - bg[c]) * (fg[c] - bg[c]);
      denominator += (fg[c] - bg[c]) ** 2;
    }
    patch.push(Math.max(0, Math.min(1, numerator / denominator)));
  }
  return { level, patch };
}
// Train only from the corresponding original static export; no invented marks.
const templates = symbols.map(() => new Float64Array(117)), counts = symbols.map(() => 0);
for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
  const label = labels[r * columns + c], { patch } = cell(0, c, r);
  patch.forEach((v, i) => { templates[label][i] += v; }); counts[label]++;
}
templates.forEach((patch, kind) => patch.forEach((v, i) => { patch[i] = v / counts[kind]; }));
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const result = []; let matches = 0;
for (let f = 0; f < frames; f++) {
  let encoded = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const { level, patch } = cell(f, c, r);
    const errors = templates.map(template => patch.reduce((sum, v, i) => sum + (v - template[i]) ** 2, 0));
    const kind = errors.reduce((best, error, i) => error < errors[best] ? i : best, 0);
    if (!f && kind === labels[r * columns + c]) matches++;
    encoded += alphabet[level < 2 || !kind ? 0 : level * 5 + kind];
  }
  result.push(encoded);
}
if (matches / labels.length < .98) throw new Error(`Glyph readback disagrees with the original SVG: ${matches}/${labels.length}`);
const output = { columns, rows, duration: Number(timing.format.duration) * 1000,
  times: timing.frames.map(f => Number(f.best_effort_timestamp_time) * 1000),
  sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'), frames: result };
writeFileSync('assets/atlas-motion.json', JSON.stringify(output));
console.log(`Atlas: ${frames} native frames; original glyph readback ${(100 * matches / labels.length).toFixed(2)}%; no procedural movement.`);
