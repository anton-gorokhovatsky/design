import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtimeFiles = [
  "js/preferences.js",
  "js/analytics.js",
  "js/signal-field.js",
  "js/map-data.js",
  "js/observation-route.js",
  "js/personal-media.js",
  "js/sphere-surfaces.js",
  "js/map-engine.js",
  "js/viewport-ui.js",
  "js/panels.js",
  "js/case-view.js",
  "js/favicon.js",
];

export const readRuntimeSource = (projectRoot) => runtimeFiles
  .map((path) => readFileSync(join(projectRoot, path), "utf8"))
  .join("\n");
