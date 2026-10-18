import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtimeFiles = [
  "js/preferences.js",
  "js/whoop-day.js",
  "js/whoop-aura.js",
  "js/presence.js",
  "js/atlas-motion.js",
  "js/analytics.js",
  "js/cipher-field.js",
  "js/signal-field.js",
  "js/map-data.js",
  "js/observation-route.js",
  "js/personal-media.js",
  "js/sphere-surfaces.js",
  "js/map-media.js",
  "js/map-engine.js",
  "js/map-controls.js",
  "js/viewport-ui.js",
  "js/panels.js",
  "js/case-view.js",
  "js/favicon.js",
  "js/work-tags.js",
  "js/mobile-first.js",
  "js/focused-home.js",
  "js/spatial-home.js",
  "js/orbit-physics.js",
  "js/practice-audience.js",
  "js/practice-orbits.js",
];

export const readRuntimeSource = (projectRoot) => runtimeFiles
  .map((path) => readFileSync(join(projectRoot, path), "utf8"))
  .join("\n");
