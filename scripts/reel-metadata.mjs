import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "acorn";
import { reelSpecs, reelFrame, getReelChapterFileName } from "./reel-specs.mjs";

export const contentHash = path => createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
export function probeMaster(path, spec) {
  const probe = JSON.parse(execFileSync(process.env.PORTFOLIO_FFPROBE || "ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=width,height,sample_aspect_ratio,display_aspect_ratio,duration:format_tags=comment", "-of", "json", path,
  ], { encoding: "utf8" }));
  const video = probe.streams?.[0], duration = Number(video?.duration);
  assert.ok(video?.width === reelFrame.width && video.height === reelFrame.height
    && video.sample_aspect_ratio === "1:1" && video.display_aspect_ratio === "3:2", `${spec.master}: native 900×600, SAR 1:1 required`);
  assert.ok(duration >= spec.duration.min && duration <= spec.duration.max, `${spec.master}: unexpected duration ${duration}`);
  assert.match(probe.format?.tags?.comment || "", /source-fit=native-capture;\s*source-viewport=1200x800;\s*source-dar=3:2/);
  assert.ok(spec.chapters.every(chapter => chapter.start + chapter.duration <= duration + .067), `${spec.master}: chapter exceeds the master`);
  return Math.round(duration * 1000) / 1000;
}

// Keep the map's authored descriptions and structure. Only media URLs, measured
// duration, its displayed suffix and the managed chapter manifest are generated.
export function mediaMetadataSources(root) {
  const path = join(root, "js/map-data.js"), source = readFileSync(path, "utf8");
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const items = tree.body.flatMap(node => node.type === "VariableDeclaration" ? node.declarations : [])
    .find(node => node.id.name === "mapItems")?.init;
  assert.equal(items?.type, "ArrayExpression");
  const edits = [], versions = new Map();
  const version = relative => {
    const url = `${relative}?v=${contentHash(join(root, relative))}`;
    versions.set(relative, url); return url;
  };
  for (const spec of reelSpecs) {
    const object = items.elements.find(node => node.properties?.some(p => p.key.name === "id" && p.value.value === spec.itemId));
    assert.ok(object, `Missing map item ${spec.itemId}`);
    const props = Object.fromEntries(object.properties.map(prop => [prop.key.name, prop]));
    const duration = probeMaster(join(root, "assets/reels", spec.master), spec);
    const seconds = Math.round(duration);
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const values = {
      previewVideo: version(`assets/reels/${spec.master}`),
      previewPoster: version(`assets/reel-posters/${spec.master.slice(0, -4)}.jpg`),
      previewDuration: duration,
      previewMeta: props.previewMeta.value.value.replace(/\d{2}:\d{2}$/, time),
    };
    const missing = [];
    for (const [key, value] of Object.entries(values)) {
      if (props[key]) edits.push([props[key].value.start, props[key].value.end, JSON.stringify(value)]);
      else missing.push(`    ${key}: ${JSON.stringify(value)},`);
    }
    if (missing.length) {
      const endOfVideoLine = source.indexOf("\n", props.previewVideo.end);
      edits.push([endOfVideoLine, endOfVideoLine, `\n${missing.join("\n")}`]);
    }
  }
  const manifest = ["// reel-chapter-manifest:start", "const reelChapterSources = new Map([",
    ...reelSpecs.map(spec => `  [${JSON.stringify(spec.itemId)}, [${spec.chapters.map((_, i) => JSON.stringify(version(`assets/reel-chapters/${getReelChapterFileName(spec, i)}`))).join(", ")}]],`),
    "]);", "// reel-chapter-manifest:end"].join("\n");
  const start = source.indexOf("// reel-chapter-manifest:start"), end = source.indexOf("// reel-chapter-manifest:end");
  assert.ok(start >= 0 && end > start);
  edits.push([start, end + "// reel-chapter-manifest:end".length, manifest]);
  const next = edits.sort((a, b) => b[0] - a[0]).reduce((text, [a, b, value]) => text.slice(0, a) + value + text.slice(b), source);
  // Includes lazy overview posters and any case-figure references in JSON.
  const html = readFileSync(join(root, "index.html"), "utf8").replace(
    /assets\/(?:reels|reel-posters|reel-chapters)\/[a-z0-9-]+\.(?:mp4|jpg)(?:\?v=[a-f0-9]{12})?/g,
    url => versions.get(url.split("?")[0]) || url,
  );
  return new Map([[path, next], [join(root, "index.html"), html]]);
}
export function syncReelMetadata(root, { check = false } = {}) {
  const sources = mediaMetadataSources(root);
  for (const [path, source] of sources) {
    const current = readFileSync(path, "utf8");
    if (check) assert.equal(current, source, `${path}: stale reel metadata; run pnpm media:prepare --sync`);
    else if (current !== source) writeFileSync(path, source);
  }
}
