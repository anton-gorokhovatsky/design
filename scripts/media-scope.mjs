import { parse } from "acorn";
import { parse as parseHtml } from "parse5";
import { reelSpecs, validateReelSpecs, getReelChapterFileName } from "./reel-specs.mjs";

export const mediaAssetPaths = new Set(reelSpecs.flatMap(spec => [
  `assets/reels/${spec.master}`, `assets/reel-posters/${spec.master.slice(0, -4)}.jpg`,
  ...spec.chapters.map((_, index) => `assets/reel-chapters/${getReelChapterFileName(spec, index)}`),
]));
const identity = specs => JSON.stringify(specs.map(({ itemId, master }) => [itemId, master]));
const maskUrlHash = source => source.replace(/(assets\/(?:reels|reel-posters|reel-chapters)\/[a-z0-9-]+\.(?:mp4|jpg))\?v=[a-f0-9]{12}/g,
  (match, path) => mediaAssetPaths.has(path) ? `${path}?v=000000000000` : match);

const maskMapMedia = source => {
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module" }), ranges = [];
  for (const statement of tree.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.name === "reelChapterSources" && declaration.init?.type === "NewExpression"
        && declaration.init.callee.name === "Map" && declaration.init.arguments.length === 1) {
        const entries = declaration.init.arguments[0];
        if (entries.type === "ArrayExpression") for (const entry of entries.elements) {
          if (entry?.type !== "ArrayExpression" || entry.elements.length !== 2 || entry.elements[1]?.type !== "ArrayExpression") continue;
          for (const value of entry.elements[1].elements) if (value?.type === "Literal" && typeof value.value === "string") {
            ranges.push([value.start, value.end, JSON.stringify(maskUrlHash(value.value))]);
          }
        }
      }
      if (declaration.id.name !== "mapItems" || declaration.init?.type !== "ArrayExpression") continue;
      for (const item of declaration.init.elements) {
        if (item?.type !== "ObjectExpression") continue;
        const props = item.properties.filter(prop => prop.type === "Property" && !prop.computed && !prop.method && prop.kind === "init");
        const id = props.find(prop => prop.key.name === "id")?.value;
        if (id?.type !== "Literal" || !reelSpecs.some(spec => spec.itemId === id.value)) continue;
        for (const prop of props) {
          if (prop.value.type !== "Literal") continue;
          if (["previewVideo", "previewPoster"].includes(prop.key.name) && typeof prop.value.value === "string") {
            ranges.push([prop.value.start, prop.value.end, JSON.stringify(maskUrlHash(prop.value.value))]);
          }
          if (prop.key.name === "previewDuration" && Number.isFinite(prop.value.value) && prop.value.value > 0 && prop.value.value <= 120) {
            ranges.push([prop.value.start, prop.value.end, "0"]);
          }
          if (prop.key.name === "previewMeta" && typeof prop.value.value === "string") {
            ranges.push([prop.value.start, prop.value.end, JSON.stringify(prop.value.value.replace(/\d{2}:\d{2}$/, "TIME"))]);
          }
        }
      }
    }
  }
  return ranges.sort((a, b) => b[0] - a[0]).reduce((text, [start, end, value]) => text.slice(0, start) + value + text.slice(end), source);
};

const maskHtmlMedia = source => {
  const ranges = [];
  const visit = node => {
    if (["img", "video"].includes(node.tagName)) for (const attr of node.attrs || []) {
      if (!["src", "data-src", "poster"].includes(attr.name)) continue;
      const location = node.sourceCodeLocation?.attrs?.[attr.name];
      if (location) ranges.push([location.startOffset, location.endOffset,
        maskUrlHash(source.slice(location.startOffset, location.endOffset))]);
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parseHtml(source, { sourceCodeLocationInfo: true }));
  return ranges.sort((a, b) => b[0] - a[0]).reduce((text, [start, end, value]) => text.slice(0, start) + value + text.slice(end), source);
};

export const isMediaOnly = (path, before, after, isCopyOnly) => {
  if (before.includes("\0") || after.includes("\0")) return false;
  try {
    if (path === "scripts/reel-specs.json") {
      const a = validateReelSpecs(JSON.parse(before)), b = validateReelSpecs(JSON.parse(after));
      return identity(a) === identity(b);
    }
    if (path === "js/map-data.js") {
      return isCopyOnly(path, maskMapMedia(before), maskMapMedia(after));
    }
    if (path === "index.html") return isCopyOnly(path, maskHtmlMedia(before), maskHtmlMedia(after));
  } catch {
    // Code, new identities, unsafe paths and unfamiliar forms retain full CI.
  }
  return false;
};
