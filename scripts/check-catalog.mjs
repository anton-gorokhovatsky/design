// One catalogue drives local execution and the CI matrix. Scope selection may
// select a subset, but the full lane must retain every check in this catalogue.
export const componentChecks = {
  signature: "Shared author signature",
  "case-flow": "Case reading lifecycle",
  "personal-media": "Personal video lifecycle",
  "inspector-links": "Inspector destination links",
  "point-address": "Canonical and legacy point addresses",
  accessibility: "Accessibility, painted contrast and text reflow",
  "map-routes": "Map route geometry",
  "map-story": "Map story and split reading",
  "hover-layout": "Hover preview and persistent consoles",
  "whoop-ui": "WHOOP daily UI",
  "first-visit": "First visit and named navigation",
  "command-placement": "Command popup placement",
  header: "Author header and map mode switch",
  "search-icon": "Search icon and its control",
  "sphere-motion": "Sphere axial motion",
  "case-view": "Expanded case view",
  "scroll-lens": "Rendered scroll lenses",
  "observation-route": "Overview content and timing",
};

// Settings assertions already live in the core browser contracts. Keep them,
// including consent and keyboard behavior, instead of duplicating a weaker test.
export const componentCoverage = {
  signature: ["signature"],
  overview: ["observation-route", "first-visit", "case-flow", "case-view", "hover-layout", "accessibility", "inspector-links"],
  "map-presentation": ["map-story", "map-routes", "hover-layout", "sphere-motion", "first-visit", "accessibility", "observation-route"],
  "not-found": ["whoop-ui", "accessibility"],
  checks: ["signature", "point-address", "header", "search-icon"],
  "point-address": ["point-address"],
  header: ["header"],
  "search-icon": ["search-icon"],
  // Reuse the complete existing geometry, hover/focus and reflow contracts.
  "map-labels": ["map-routes", "hover-layout", "accessibility"],
  media: ["reels", "case-view", "case-flow", "hover-layout", "observation-route"],
  settings: ["core", "accessibility", "whoop-ui"],
  // Console bounds also move the author aura and detached search results.
  // WHOOP includes live-surface: 404 return, ResizeObserver and page errors.
  "console-bounds": ["header", "hover-layout", "command-placement", "whoop-ui", "map-routes", "accessibility", "case-flow"],
  whoop: ["core", "accessibility", "whoop-ui", "hover-layout", "first-visit"],
};
export const checkIds = ["core", "reels", ...Object.keys(componentChecks)];
// Editing a browser assertion selects that assertion in both engines. Helpers
// shared by multiple checks remain unclassified and therefore run the full lane.
for (const id of checkIds) componentCoverage[`check:${id}`] = [id];

// Bound the longest serial component job. These groups are balanced using the
// 19 October WebKit timings (about 6–7 min per group, formerly up to 9.5 min).
// Browsers still run serially inside each worker; the full inventory is unchanged.
const shards = {
  reading: ["case-flow", "personal-media", "case-view", "whoop-ui"],
  interface: ["accessibility", "first-visit", "command-placement", "header", "search-icon"],
  map: ["map-story", "map-routes", "hover-layout", "sphere-motion", "point-address"],
  motion: ["scroll-lens", "observation-route", "inspector-links"],
};
const webkitScenarios = ["390x844-light", "390x844-dark", "320x568-light", "320x568-dark"];

export const browserSteps = (browser) => [
  { id: "core", label: `${browser} UI contracts`, args: [browser === "chromium"
    ? "scripts/check-ui-contracts.mjs" : "scripts/webkit-regression.cjs"] },
  ...Object.entries(componentChecks).map(([id, label]) => ({
    id, label: `${label}: ${browser}`, args: ["header", "search-icon"].includes(id)
      ? ["scripts/check-local-ui.mjs", browser, id] : [`scripts/check-${id}.mjs`, browser],
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
  const add = (browser, name, checks, scenario = "", runner = browser === "webkit" ? "macos-15" : "ubuntu-latest") => {
    if (checks.length) include.push({ browser, artifact: `${browser}-${name}`, checks: checks.join(","), scenario, runner });
  };
  for (const browser of ["chromium", "webkit"]) {
    if (selected.has("signature")) add(browser, "signature", ["signature"], "", "ubuntu-latest");
    if (selected.has("core")) {
      if (browser === "webkit") for (const scenario of webkitScenarios) add(browser, scenario, ["core"], scenario);
      else add(browser, "core", ["core"]);
    }
    if (browser === "chromium" && selected.has("reels")) add(browser, "reels", ["reels"]);
    for (const [name, ids] of Object.entries(shards)) add(browser, name, ids.filter((id) => selected.has(id)));
  }
  return { include };
};
