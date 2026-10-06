#!/usr/bin/env node

import {
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const readProjectFile = (path) => readFileSync(join(projectRoot, path), "utf8");
const fileBytes = (path) => statSync(join(projectRoot, path)).size;
const indexSource = readProjectFile("index.html");
const cssBytes = fileBytes("styles.css");
const runtimeBytes = runtimeFiles.reduce((total, path) => total + fileBytes(path), 0);
const fontPaths = [
  ...indexSource.matchAll(/<link[\s\S]*?rel="preload"[\s\S]*?href="([^"]+\.woff2)"[\s\S]*?>/g),
].map((match) => match[1]);
const fontBytes = fontPaths.reduce((total, path) => total + fileBytes(path), 0);
const initialSourceBytes = cssBytes + runtimeBytes + fontBytes;
const eagerMedia = [
  ...indexSource.matchAll(/<(?:video|source)[^>]+(?:src|srcset)="([^"]+\.(?:mp4|webm))"/g),
].map((match) => match[1]);
const budgets = {
  // Accepted expanded case: +8 KiB CSS and +12 KiB dependency-free runtime.
  // +1 KiB for the compact mobile overview and native case disclosure.
  // +1 KiB for shared popup motion and rounded scroll-edge presentation.
  // +1 KiB for immediate accessibility suppression of content-only optical effects.
  // +1 KiB for the fixed work-list continuation control.
  // +6 KiB for the responsive author/WHOOP readout; settings and material are reused.
  // Approved desktop controls add 6.1 KiB; most fits the previous headroom.
  css: 242 * 1024,
  // +4 KiB for measured control clearance and deferred route posters (5 September).
  // +2 KiB for Clayton Young copy and personal map connections (6 September).
  // +2 KiB for two running channel records; no new runtime logic or media.
  // +3 KiB for short route copy, on-demand mobile posters and native case details.
  // +4 KiB for restoring section context and navigating existing map relations.
  // +4 KiB for one native-scroll edge observer shared by all window families.
  // +9 KiB for dependency-free content refraction and progressive matte edges.
  // +3 KiB for first-party poster sampling and one live iframe projection.
  // +1 KiB for the shared flared image contour at the reading frame's corners.
  // +1 KiB for the approved KS Fish project description.
  // +1 KiB for work-list overflow detection and native scroll navigation.
  // +7 KiB (2.8 KiB gzip) for the daily feed and palette; no client dependencies.
  // +1 KiB to keep the map and requested settings section aligned after data arrives.
  // +4 KiB (1.1 KiB gzip) for hover previews clearing the four persistent consoles.
  // +2 KiB for the accepted Cipher grid; no third-party renderer.
  // +1 KiB for pause-preserving route timing; decorative artwork was removed.
  // +3 KiB for anonymous live presence with one reporting tab per browser.
  // +5 KiB for replaying the actual Atlas grid export, shared by card and 404.
  // The 67 KiB gzip frame data loads only when motion and its owner are visible.
  // +2 KiB budget for cached edge maps and media-attached rasterization;
  // avoids PNG decoding each scroll frame and samples only the visible edges.
  // +2 KiB for the Krainiuk project copy and reel manifest; no new runtime logic.
  // +1 KiB for deferred related-item thumbnails, reusing the existing posters.
  // +8 KiB for native Aura generation and lifecycle under the author card.
  // This replaces the home page's 67 KiB gzip Atlas frame-data request.
  // +9 KiB for shared author presence, named episodes, canonical project names
  // and fourteen contextual figure captions. All figures remain lazy images.
  // +6 KiB for the approved 14-stop narrative, per-step timing and one on-demand
  // media player shared by desktop and mobile; existing reels are reused.
  // +1 KiB to preserve the shared CSS corner shape in scrolling media rasterization.
  // +3 KiB for contact-console geometry/focus and revised overview copy
  // (2,472 source bytes / 605 gzip bytes); total source and media budgets stay fixed.
  // +2 KiB for Parfyonov's two-part film and selection in the existing player.
  // Official posters stay local and load only when this card is opened.
  // +1 KiB for the favorite monologue, revised copy and bounded video playback.
  // +1 KiB for the author-provided quotation and its shared reading component.
  // +6 KiB for native desktop disclosures, map anchors and dialog focus return.
  runtime: 325 * 1024,
  fonts: 160 * 1024,
  // Akt preloads all weights in one 110 KiB variable font. The complete family
  // is smaller than four Golos files; the initial two-weight preload was smaller.
  // +2 KiB for shared vector close icons and on-demand related previews.
  // +12 KiB total: 9 KiB runtime above and 3 KiB for shared reading/preview layouts.
  // +2 KiB for responsive overview controls and explicitly matched principle stills.
  // Media stays deferred; no additional dependencies or eager requests.
  // +3 KiB total for the film record, episode controls and their shared styles.
  // +12 KiB for the approved desktop-control CSS and dependency-free module.
  initialSource: 676 * 1024,
};
const failures = [];

for (const [name, maximum] of Object.entries(budgets)) {
  const actual = name === "css"
    ? cssBytes
    : name === "runtime"
      ? runtimeBytes
      : name === "fonts"
        ? fontBytes
        : initialSourceBytes;

  if (actual > maximum) {
    failures.push(`${name}: ${actual} bytes exceeds ${maximum}`);
  }
}

if (eagerMedia.length > 0) {
  failures.push(`eager media: ${eagerMedia.join(", ")}`);
}

if (failures.length > 0) {
  console.error(`Performance budget failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  "Performance budget passed: "
    + `${(cssBytes / 1024).toFixed(1)} KiB CSS, `
    + `${(runtimeBytes / 1024).toFixed(1)} KiB runtime, `
    + `${(fontBytes / 1024).toFixed(1)} KiB preloaded fonts, `
    + `${(initialSourceBytes / 1024).toFixed(1)} KiB first-party source; `
    + "zero eager video.",
);
