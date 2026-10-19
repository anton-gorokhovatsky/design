#!/usr/bin/env node

import {
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
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
// Reviewed 18 October 2026: the requested ten-project orbital navigation adds
// its canvas renderer, touch picker and Newtonian solver (~5 KiB gzip).
// Its three modules are counted here, including audience weights; no libraries
// or eager media were added. The author approved 2 KiB additional runtime/gzip
// headroom for close-encounter error control on 18 October; CSS/fonts unchanged.
// Reviewed 19 October: the accepted celestial bodies add ~12.3 KiB source
// and ~6.2 KiB gzip including styles. No libraries, fonts or media are added.
// The limits include this approved feature with a small measured margin.
// Gzip is measured with this Node/zlib version, not the CDN or a connection.
const budgets = {
  css: 282 * 1024,
  runtime: 416 * 1024,
  fonts: 160 * 1024,
  initialSource: 812 * 1024,
  cssGzip: 50 * 1024,
  runtimeGzip: 128 * 1024,
  initialCompressed: 288 * 1024,
};
const cssGzip = gzipSync(readProjectFile("styles.css"), { level: 9 }).length;
const runtimeGzip = runtimeFiles.reduce((total, path) => total
  + gzipSync(readProjectFile(path), { level: 9 }).length, 0);
const measured = {
  css: cssBytes, runtime: runtimeBytes, fonts: fontBytes, initialSource: initialSourceBytes,
  cssGzip, runtimeGzip, initialCompressed: cssGzip + runtimeGzip + fontBytes,
};
const failures = [];

for (const [name, maximum] of Object.entries(budgets)) {
  const actual = measured[name];

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
    + `${(cssGzip / 1024).toFixed(1)} KiB CSS gzip, ${(runtimeGzip / 1024).toFixed(1)} KiB runtime gzip; `
    + "zero eager video.\n"
    + Object.entries(budgets).map(([name, limit]) => `${name}: ${limit - measured[name]} bytes headroom`).join("; "),
);
