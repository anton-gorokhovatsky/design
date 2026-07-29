#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRuntimeSource } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const assetsRoot = join(projectRoot, "assets");
const readProjectFile = (path) => readFileSync(join(projectRoot, path), "utf8");

const walkFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const source = [
  readProjectFile("index.html"),
  readProjectFile("styles.css"),
  readRuntimeSource(projectRoot),
  readProjectFile("README.md"),
].join("\n");
const assetFiles = walkFiles(assetsRoot)
  .map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  .sort();
const sourceOnlyAssets = new Set([
  "assets/favicon.svg",
  "assets/fonts/OFL-GolosText.txt",
]);
const derivedAssets = new Set(
  [...source.matchAll(/assets\/reels\/([a-zA-Z0-9_-]+)\.mp4/g)]
    .map((match) => `assets/reel-posters/${match[1]}.jpg`),
);
const orphanAssets = assetFiles.filter((path) => (
  !sourceOnlyAssets.has(path)
  && !derivedAssets.has(path)
  && !source.includes(path)
));
const referencedAssets = [
  ...new Set([...source.matchAll(/assets\/[a-zA-Z0-9_./-]+/g)].map((match) => (
    match[0].replace(/[),.;:'"]+$/, "")
  )).concat([...derivedAssets])),
].sort();
const missingAssets = referencedAssets.filter((path) => !existsSync(join(projectRoot, path)));
const repositoryBytes = assetFiles.reduce(
  (total, path) => total + statSync(join(projectRoot, path)).size,
  0,
);

if (orphanAssets.length || missingAssets.length) {
  if (orphanAssets.length) {
    console.error(`Orphan assets:\n- ${orphanAssets.join("\n- ")}`);
  }
  if (missingAssets.length) {
    console.error(`Missing referenced assets:\n- ${missingAssets.join("\n- ")}`);
  }
  process.exit(1);
}

console.log(
  `Asset graph passed: ${assetFiles.length} files, `
  + `${(repositoryBytes / 1024 / 1024).toFixed(1)} MiB, zero orphans.`,
);
