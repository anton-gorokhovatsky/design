// A monochrome, font-independent derivative of the retained Atlas export.
// Keep the original unchanged: it also supplies the accepted share image.
import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync(new URL("../assets/observation/atlas.svg", import.meta.url), "utf8");
const palette = ["#ecece8", "#d9dbe0", "#b5bbd4", "#858eb9", "#5e6bd0", "#3c48c0", "#23337f", "#152151"];
const attributes = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => match.slice(1)));
const tiles = [...source.matchAll(/<rect\s([^>]+)>?/g)].map(match => attributes(match[1]));
const bands = palette.map(() => []);
const n = value => Number(value.toFixed(2));
for (const row of source.matchAll(/<text\s([^>]+)>([\s\S]*?)<\/text>/g)) {
  const baseline = Number(attributes(row[1]).y);
  for (const cell of row[2].matchAll(/<tspan\s([^>]+)>(.*?)<\/tspan>/g)) {
    const x = Number(attributes(cell[1]).x), y = baseline - 12;
    const tile = tiles.find(t => x >= +t.x && x < +t.x + +t.width && y >= +t.y && y < +t.y + +t.height);
    const level = palette.indexOf(tile?.fill);
    if (level < 2) continue;
    const cx = n(x * .4), cy = n(y * .4), r = 1.65;
    const sign = cell[2];
    const glyph = sign === "+" ? `M${n(cx-r)} ${cy}h${r*2}M${cx} ${n(cy-r)}v${r*2}`
      : sign === "×" ? `M${n(cx-r)} ${n(cy-r)}l${r*2} ${r*2}m-${r*2} 0l${r*2} -${r*2}`
      : sign === ":" ? `M${cx} ${n(cy-1.8)}v.1m0 3.5v.1` : `M${cx} ${cy}v.1`;
    bands[level].push(glyph);
  }
}
const paths = bands.map((items, level) => items.length
  ? `<path opacity="${n(.18 + level * .105)}" d="${items.join("")}"/>` : "").join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><g fill="none" stroke="white" stroke-width="1.1" stroke-linecap="round">${paths}</g></svg>\n`;
writeFileSync(new URL("../assets/atlas-terrain.svg", import.meta.url), svg);
console.log(`Atlas terrain: ${bands.flat().length} marks, ${Buffer.byteLength(svg)} bytes.`);
