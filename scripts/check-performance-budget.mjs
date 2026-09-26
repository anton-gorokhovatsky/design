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
  css: 240 * 1024,
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
  runtime: 274 * 1024,
  fonts: 160 * 1024,
  // Akt preloads all weights in one 110 KiB variable font. The complete family
  // is smaller than four Golos files; the initial two-weight preload was smaller.
  initialSource: 616 * 1024,
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
