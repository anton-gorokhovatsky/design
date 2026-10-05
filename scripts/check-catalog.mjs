// One catalogue drives local execution and the CI matrix. Scope selection may
// select a subset, but the full lane must retain every check in this catalogue.
export const componentChecks = {
  "case-flow": "Case reading lifecycle",
  "personal-media": "Personal video lifecycle",
  "inspector-links": "Inspector destination links",
  accessibility: "Accessibility, painted contrast and text reflow",
  "map-routes": "Map route geometry",
  "hover-layout": "Hover preview and persistent consoles",
  "whoop-ui": "WHOOP daily UI",
  "first-visit": "First visit and named navigation",
  "command-placement": "Command popup placement",
  "sphere-motion": "Sphere axial motion",
  "case-view": "Expanded case view",
  "scroll-lens": "Rendered scroll lenses",
  "observation-route": "Overview content and timing",
};

// Settings assertions already live in the core browser contracts. Keep them,
// including consent and keyboard behavior, instead of duplicating a weaker test.
export const componentCoverage = {
  media: ["reels", "case-view", "case-flow", "hover-layout", "observation-route"],
  settings: ["core", "accessibility", "whoop-ui"],
  whoop: ["core", "accessibility", "whoop-ui", "hover-layout", "first-visit"],
};
export const checkIds = ["core", "reels", ...Object.keys(componentChecks)];

// Bound the longest serial component job. These groups are balanced using the
// measured WebKit timings; browsers still run serially inside each worker.
const shards = {
  reading: ["case-flow", "personal-media", "case-view"],
  interface: ["accessibility", "whoop-ui", "first-visit", "command-placement"],
  map: ["map-routes", "hover-layout", "sphere-motion", "inspector-links"],
  motion: ["scroll-lens", "observation-route"],
};
const webkitScenarios = ["390x844-light", "390x844-dark", "320x568-light", "320x568-dark"];

export const browserSteps = (browser) => [
  { id: "core", label: `${browser} UI contracts`, args: [browser === "chromium"
    ? "scripts/check-ui-contracts.mjs" : "scripts/webkit-regression.cjs"] },
  ...Object.entries(componentChecks).map(([id, label]) => ({
    id, label: `${label}: ${browser}`, args: [`scripts/check-${id}.mjs`, browser],
  })),
].map((step) => ({ ...step, scope: browser, command: process.execPath }));

export const browserMatrix = (mode, components = []) => {
  if (mode === "copy") return { include: [] };
  if (!["full", "components"].includes(mode)) throw new Error(`Unknown release mode: ${mode}`);
  if (mode === "components" && (!components.length || components.some((id) => !componentCoverage[id]))) {
    throw new Error("Component scope requires known coverage");
  }
  const selected = new Set(mode === "full" ? checkIds : components.flatMap((id) => componentCoverage[id]));
  const include = [];
  const add = (browser, name, checks, scenario = "") => {
    if (checks.length) include.push({ browser, artifact: `${browser}-${name}`, checks: checks.join(","), scenario });
  };
  for (const browser of ["chromium", "webkit"]) {
    if (selected.has("core")) {
      if (browser === "webkit") for (const scenario of webkitScenarios) add(browser, scenario, ["core"], scenario);
      else add(browser, "core", ["core"]);
    }
    if (browser === "chromium" && selected.has("reels")) add(browser, "reels", ["reels"]);
    for (const [name, ids] of Object.entries(shards)) add(browser, name, ids.filter((id) => selected.has(id)));
  }
  return { include };
};
