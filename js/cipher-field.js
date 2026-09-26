// Original implementation inspired by Cipher's ordered glyph fields.
// It rasterises the existing ten moving emoji silhouettes; no remote runtime.
export function composeCipher(points, fieldScale) {
  const step = Math.max(5.5, Math.min(9, fieldScale / 62));
  const cells = new Map();
  for (const point of points) {
    const column = point.x / step;
    const row = point.y / step;
    const left = Math.floor(column);
    const top = Math.floor(row);
    for (let dx = 0; dx <= 1; dx += 1) {
      for (let dy = 0; dy <= 1; dy += 1) {
        const x = left + dx;
        const y = top + dy;
        const coverage = (1 - Math.abs(column - x)) * (1 - Math.abs(row - y));
        const mass = coverage * (0.35 + point.weight * 0.65);
        if (mass < 0.04) continue;
        const key = `${x}:${y}`;
        let cell = cells.get(key);
        if (!cell) {
          cell = { column: x, row: y, x: x * step, y: y * step, mass: 0, z: 0, perspective: 0 };
          cells.set(key, cell);
        }
        cell.mass += mass;
        cell.z += point.z * mass;
        cell.perspective += point.perspective * mass;
      }
    }
  }

  const result = [];
  for (const cell of cells.values()) {
    // A low-amplitude wave groups marks without drawing new graph connections.
    const band = 0.88 + 0.12 * Math.cos(cell.column * 0.29 + Math.sin(cell.row * 0.14) * 2);
    const mass = cell.mass * band;
    if (mass < 0.13) continue;
    const weight = Math.min(0.94, mass * 0.64);
    result.push({
      x: cell.x,
      y: cell.y,
      z: cell.z / cell.mass,
      perspective: cell.perspective / cell.mass,
      weight,
      glyph: mass > 1.1 ? "×" : mass > 0.62 ? "+" : mass > 0.3 ? ":" : "·",
    });
  }
  return result;
}
