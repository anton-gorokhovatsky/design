#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { readRuntimeSource, runtimeFiles } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const jsonOutput = process.argv.includes("--json");
const strictMode = process.argv.includes("--strict");

const readProjectFile = (path) => readFileSync(join(projectRoot, path), "utf8");
const indexSource = readProjectFile("index.html");
const scriptSource = readRuntimeSource(projectRoot);
const mapDataSource = readProjectFile("js/map-data.js");
const styleSource = readProjectFile("styles.css");
const cname = readProjectFile("CNAME").trim();
const stateMatrixPath = join(projectRoot, "docs", "ui-state-matrix.md");
const stateMatrixSource = existsSync(stateMatrixPath)
  ? readFileSync(stateMatrixPath, "utf8")
  : "";
const agentEvalsPath = join(projectRoot, "docs", "agent-evals.md");
const agentEvalsSource = existsSync(agentEvalsPath)
  ? readFileSync(agentEvalsPath, "utf8")
  : "";

const findings = [];

const addFinding = (level, code, message, details = undefined) => {
  findings.push({
    level,
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
};

const requireContract = (condition, code, message, details = undefined) => {
  if (!condition) {
    addFinding("error", code, message, details);
  }
};

const warnContract = (condition, code, message, details = undefined) => {
  if (!condition) {
    addFinding("warning", code, message, details);
  }
};

const extractMapItems = () => {
  const declaration = "const mapItems = ";
  const start = mapDataSource.indexOf(declaration);
  const endMarker = "\n];";

  requireContract(
    start !== -1,
    "map-data-missing",
    "Could not find the mapItems declaration in js/map-data.js.",
  );

  if (start === -1) {
    return [];
  }

  const literalStart = start + declaration.length;
  const markerIndex = mapDataSource.lastIndexOf(endMarker);

  requireContract(
    markerIndex !== -1,
    "map-data-end-missing",
    "Could not find the end of the mapItems declaration.",
  );

  if (markerIndex === -1) {
    return [];
  }

  const literal = mapDataSource.slice(literalStart, markerIndex + 2);

  try {
    return runInNewContext(
      `(${literal})`,
      Object.create(null),
      {
        timeout: 1000,
        contextCodeGeneration: { strings: false, wasm: false },
      },
    );
  } catch (error) {
    addFinding(
      "error",
      "map-data-parse",
      "The mapItems literal could not be parsed as deterministic data.",
      String(error),
    );
    return [];
  }
};

const extractEmbeddedJson = (id) => {
  const pattern = new RegExp(
    `<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`,
  );
  const match = indexSource.match(pattern);

  requireContract(
    Boolean(match),
    "embedded-json-missing",
    `Could not find embedded JSON data "${id}" in index.html.`,
  );

  if (!match) {
    return {};
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    addFinding(
      "error",
      "embedded-json-parse",
      `Embedded JSON data "${id}" could not be parsed.`,
      String(error),
    );
    return {};
  }
};

const mapItems = extractMapItems();
const mapEvidenceById = extractEmbeddedJson("map-evidence-data");
const allowedKinds = new Set(["company", "project", "personal", "practice"]);
const ids = new Set();
const duplicateIds = new Set();
const requiredTextFields = [
  "id",
  "kind",
  "label",
  "title",
  "meta",
  "description",
  "kindLabel",
];

for (const item of mapItems) {
  for (const field of requiredTextFields) {
    requireContract(
      typeof item[field] === "string" && item[field].trim().length > 0,
      "map-field",
      `Map item ${item.id || "(missing id)"} has no usable ${field}.`,
    );
  }

  if (ids.has(item.id)) {
    duplicateIds.add(item.id);
  }
  ids.add(item.id);

  requireContract(
    /^[a-z0-9-]+$/.test(item.id),
    "map-id-format",
    `Map id "${item.id}" is not a stable lowercase slug.`,
  );
  requireContract(
    allowedKinds.has(item.kind),
    "map-kind",
    `Map item "${item.id}" uses unsupported kind "${item.kind}".`,
  );
  requireContract(
    Number.isFinite(item.x) && item.x >= 0 && item.x <= 100,
    "map-x",
    `Map item "${item.id}" has x outside 0–100.`,
  );
  requireContract(
    Number.isFinite(item.y) && item.y >= 0 && item.y <= 100,
    "map-y",
    `Map item "${item.id}" has y outside 0–100.`,
  );
  requireContract(
    Number.isFinite(item.size) && item.size > 0,
    "map-size",
    `Map item "${item.id}" has no positive visual weight.`,
  );

  if (item.href) {
    try {
      new URL(item.href);
    } catch {
      addFinding(
        "error",
        "map-href",
        `Map item "${item.id}" has an invalid href.`,
        item.href,
      );
    }
  }
}

requireContract(
  duplicateIds.size === 0,
  "map-id-duplicate",
  "Map ids must be unique.",
  [...duplicateIds].sort(),
);

const notionProjectIds = [
  "narkomfin",
  "garage-courses",
  "garage-app",
  "garage-institutions",
  "garage-site",
  "collection",
  "garage-webzine",
];
const notionExperienceIds = [
  "garage",
  "private-practice",
  "optimal",
  "ilmix",
];
const hhExperienceIds = ["early-career"];
const incompleteNotionEvidence = notionProjectIds.filter((id) => {
  const evidence = mapEvidenceById[id];
  return !evidence || ["task", "role", "result"].some((field) => (
    typeof evidence[field] !== "string" || !evidence[field].trim()
  ));
});
const incompleteNotionExperience = notionExperienceIds.filter((id) => {
  const evidence = mapEvidenceById[id];
  return !evidence || ["task", "role", "result"].some((field) => (
    typeof evidence[field] !== "string" || !evidence[field].trim()
  ));
});
const incompleteHhExperience = hhExperienceIds.filter((id) => {
  const evidence = mapEvidenceById[id];
  return !evidence || ["task", "role", "result"].some((field) => (
    typeof evidence[field] !== "string" || !evidence[field].trim()
  ));
});
const orphanEvidenceIds = Object.keys(mapEvidenceById).filter((id) => !ids.has(id));

requireContract(
  mapItems.every((item) => !("evidence" in item)),
  "map-evidence-runtime",
  "Long-form project evidence must stay in embedded content data, not the runtime map graph.",
);
requireContract(
  incompleteNotionEvidence.length === 0,
  "notion-project-evidence",
  "All seven projects from the Notion project table need task, role, and result evidence.",
  incompleteNotionEvidence,
);
requireContract(
  incompleteNotionExperience.length === 0,
  "notion-experience-evidence",
  "The four current Notion experience anchors need task, role, and result evidence.",
  incompleteNotionExperience,
);
requireContract(
  incompleteHhExperience.length === 0,
  "hh-experience-evidence",
  "The early-career anchor sourced from hh.ru needs task, role, and result evidence.",
  incompleteHhExperience,
);
requireContract(
  orphanEvidenceIds.length === 0,
  "map-evidence-orphan",
  "Every embedded evidence record must belong to an existing map node.",
  orphanEvidenceIds,
);
requireContract(
  mapEvidenceById.narkomfin?.result.includes("51\u00a0420")
    && mapEvidenceById.narkomfin?.result.includes("67\u00a0893")
    && mapEvidenceById["garage-courses"]?.result.includes("четыре курса")
    && mapEvidenceById["garage-webzine"]?.role.includes("ChatGPT")
    && mapEvidenceById["garage-institutions"]?.result.includes("Сотворчество")
    && mapEvidenceById["garage-site"]?.result.includes("Awwwards"),
  "notion-project-facts",
  "Distinctive source facts from the seven Notion cards must remain represented.",
);
requireContract(
  mapEvidenceById.optimal?.task.includes("вернуть управляемость")
    && mapEvidenceById.optimal?.role.includes("Принял проект у другого менеджера")
    && mapEvidenceById.optimal?.role.includes("навёл порядок")
    && mapEvidenceById.optimal?.role.includes("оптимизировал")
    && mapEvidenceById.optimal?.result.includes("Передал новому менеджеру")
    && mapEvidenceById.optimal?.result.includes("дорожной карте")
    && mapEvidenceById.ilmix?.result.includes("19\u00a0905")
    && mapEvidenceById.ilmix?.result.includes("48\u00a0835")
    && mapEvidenceById.ilmix?.result.includes("66,9\u00a0%")
    && indexSource.includes("15&nbsp;лет работаю на&nbsp;стыке продукта"),
  "notion-experience-facts",
  "Distinctive source facts from the full Notion resume must remain represented.",
);
const optimal = mapItems.find((item) => item.id === "optimal");
const earlyCareer = mapItems.find((item) => item.id === "early-career");
requireContract(
  optimal?.href === "https://optimalgroup.ru/projects/academy-tn-ru/"
    && optimal?.linkLabel === "ОТКРЫТЬ КЕЙС",
  "optimal-case-route",
  "The OptimalGroup experience anchor must link to the public Academy case.",
);
requireContract(
  earlyCareer?.timeLabel === "2010—2016"
    && earlyCareer?.href === "https://hh.ru/resume/e469b9deff00850af10039ed1f736563726574?print=true"
    && earlyCareer?.linkLabel === "ПОЛНОЕ РЕЗЮМЕ НА HH.RU"
    && mapEvidenceById["early-career"]?.role.includes("ВАЛЛЕКС М")
    && mapEvidenceById["early-career"]?.role.includes("ИльмиксГрупп")
    && mapEvidenceById["early-career"]?.role.includes("Freya Project")
    && mapEvidenceById["early-career"]?.result.includes("онлайн-платежами"),
  "hh-experience-facts",
  "Distinctive early-career facts from the public hh.ru resume must remain represented.",
);

for (const item of mapItems) {
  if (!item.parent) {
    continue;
  }

  requireContract(
    ids.has(item.parent),
    "map-parent",
    `Map item "${item.id}" points to missing parent "${item.parent}".`,
  );
  requireContract(
    item.parent !== item.id,
    "map-parent-self",
    `Map item "${item.id}" cannot be its own parent.`,
  );
}

const kindCounts = Object.fromEntries(
  [...allowedKinds].map((kind) => [
    kind,
    mapItems.filter((item) => item.kind === kind).length,
  ]),
);
const garage = mapItems.find((item) => item.id === "garage");
const maximumSize = Math.max(0, ...mapItems.map((item) => item.size));
const independentProjectIds = [
  "shirokostup",
  "tarski",
  "herman",
  "dusty",
  "dd-camp",
  "eleven",
  "ks-fish",
  "doronin",
];
const missingProjectMapLabels = independentProjectIds.filter((id) => {
  const item = mapItems.find((candidate) => candidate.id === id);
  return !item || typeof item.mapLabel !== "string" || !item.mapLabel.trim();
});

requireContract(
  Boolean(garage),
  "garage-missing",
  "The Garage Museum anchor node is missing.",
);
requireContract(
  garage?.kind === "company" && garage?.size === maximumSize,
  "garage-weight",
  "Garage must remain the largest institution node.",
);
requireContract(
  kindCounts.practice === 17,
  "principle-count",
  "The map must keep exactly 17 principle nodes.",
  { actual: kindCounts.practice },
);
const authorialPrincipleDigest = createHash("sha256")
  .update(
    mapItems
      .filter((item) => item.kind === "practice")
      .map((item) => item.description)
      .join("\n"),
  )
  .digest("hex");
requireContract(
  authorialPrincipleDigest
    === "3c86e5b032fd926f86179d5f2bc9898b4e2d571cf3cd9f0f7420ea79b71da687",
  "principle-authorial-copy",
  "Principle descriptions are authorial source text and must stay verbatim; only headings and labels may be edited without an approved source-copy update.",
  { actual: authorialPrincipleDigest },
);
requireContract(
  missingProjectMapLabels.length === 0,
  "project-map-labels",
  "All eight current projects must repeat their descriptive title in the map focus label.",
  missingProjectMapLabels,
);

const reelDirectory = join(projectRoot, "assets", "reels");
const reelFiles = readdirSync(reelDirectory)
  .filter((name) => name.endsWith(".mp4"))
  .sort();
const reelReferences = mapItems
  .filter((item) => item.previewVideo)
  .map((item) => ({
    id: item.id,
    path: item.previewVideo.split("?")[0],
    meta: item.previewMeta,
  }));
const referencedReels = reelReferences.map(({ path }) => path.split("/").at(-1));
const missingReelFiles = reelReferences
  .filter(({ path }) => !existsSync(join(projectRoot, path)))
  .map(({ id, path }) => ({ id, path }));
const orphanReels = reelFiles.filter((name) => !referencedReels.includes(name));
const duplicatedReels = referencedReels.filter(
  (name, index, collection) => collection.indexOf(name) !== index,
);

requireContract(
  reelFiles.length === 17,
  "reel-count",
  "The master reel set must contain 17 videos.",
  { actual: reelFiles.length },
);
requireContract(
  missingReelFiles.length === 0,
  "reel-reference-missing",
  "One or more map nodes references a missing reel.",
  missingReelFiles,
);
requireContract(
  orphanReels.length === 0,
  "reel-orphan",
  "Every reel file must be referenced by one map node.",
  orphanReels,
);
requireContract(
  duplicatedReels.length === 0,
  "reel-duplicate",
  "A reel file must not be assigned to multiple map nodes.",
  [...new Set(duplicatedReels)].sort(),
);
requireContract(
  reelReferences.every(({ meta }) => typeof meta === "string" && meta.trim()),
  "reel-meta",
  "Every reel-enabled node needs previewMeta.",
);
requireContract(
  reelReferences.every(({ meta }) => !/ПРОХОД ПО САЙТУ|ТРИ СТРАНИЦЫ|ТЕМА \+ ТЕКСТ/.test(meta)),
  "reel-meta-specific",
  "Reel captions must describe the visible content instead of using a generic playback label.",
  reelReferences.filter(({ meta }) => /ПРОХОД ПО САЙТУ|ТРИ СТРАНИЦЫ|ТЕМА \+ ТЕКСТ/.test(meta)),
);

const materialDefinitions = [...styleSource.matchAll(/--material-01:\s*([^;]+);/g)]
  .map((match) => match[1].replace(/\s+/g, " ").trim());
const materialThemeDefinitions = materialDefinitions.filter((value) => (
  /rgba\([^)]*,\s*0\.5\)/.test(value)
));
const materialAccessibilityDefinitions = materialDefinitions.filter((value) => value === "Canvas");
const materialUsages = (styleSource.match(/var\(--material-01\)/g) || []).length;
const requiredMaterialSurfaces = [
  "axis-north",
  "axis-east",
  "axis-south",
  "axis-west",
  "inspector-close",
  "inspector-kind",
  "inspector-identity",
  "inspector-description",
  "inspector-observation",
  "inspector-related",
  "personal-media-launch",
  "personal-media-source",
  "personal-media-close",
  "personal-media-play",
  "desktop-console",
  "mobile-navigation",
  "mobile-search",
  "search-results",
  "search-status",
  "origin-label",
  "mobile-system-dock",
  "desktop-view-console",
  "desktop-display-console",
  "panel-heading",
  "panel-close",
  "reel-readout",
  "work-intro",
  "work-01",
  "work-02",
  "work-03",
  "work-04",
  "work-05",
  "work-06",
  "work-07",
  "work-08",
  "approach-intro",
  "approach-01",
  "approach-02",
  "approach-03",
  "approach-04",
  "contact",
  "settings-panel",
];
const materialSurfaceTags = [
  ...indexSource.matchAll(/<[^>]*\sdata-material-surface="([^"]+)"[^>]*>/gs),
].map((match) => ({
  name: match[1],
  mode: match[0].match(/\sdata-material-active="([^"]+)"/)?.[1] || "",
  tag: match[0].replace(/\s+/g, " ").trim(),
}));
const materialSurfaceNames = materialSurfaceTags.map(({ name }) => name);
const duplicateMaterialSurfaces = materialSurfaceNames.filter(
  (name, index, names) => names.indexOf(name) !== index,
);
const missingMaterialSurfaces = requiredMaterialSurfaces.filter(
  (name) => !materialSurfaceNames.includes(name),
);
const unexpectedMaterialSurfaces = materialSurfaceNames.filter(
  (name) => !requiredMaterialSurfaces.includes(name),
);
const invalidMaterialModes = materialSurfaceTags.filter(
  ({ mode }) => !["always", "desktop", "mobile"].includes(mode),
);
const dynamicMaterialSurfaces = [
  {
    name: "case-story",
    assignment: 'sheet.dataset.materialSurface = "case-story";',
    mode: 'sheet.dataset.materialActive = "always";',
  },
  {
    name: "map-node-label",
    assignment: 'label.dataset.materialSurface = "map-node-label";',
    mode: 'label.dataset.materialActive = "always";',
  },
];
const missingDynamicMaterialSurfaces = dynamicMaterialSurfaces.filter(
  ({ assignment, mode }) => !scriptSource.includes(assignment) || !scriptSource.includes(mode),
);
const materialCascadeMarker = "/* MATERIAL / 01 CASCADE CONTRACT";
const materialCascadeIndex = styleSource.lastIndexOf(materialCascadeMarker);
const materialCascadeSource = materialCascadeIndex >= 0
  ? styleSource.slice(materialCascadeIndex)
  : "";
const backdropValues = [
  ...styleSource.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/g),
].map((match) => match[1].replace(/\s+/g, " ").trim());
const backdropInventory = Object.fromEntries(
  [...new Set(backdropValues)].sort().map((value) => [
    value,
    backdropValues.filter((candidate) => candidate === value).length,
  ]),
);

requireContract(
  materialThemeDefinitions.length === 2
    && materialAccessibilityDefinitions.length <= 1
    && materialDefinitions.length
      === materialThemeDefinitions.length + materialAccessibilityDefinitions.length,
  "material-token",
  "MATERIAL / 01 needs exactly two 50% theme values; only a Canvas forced-colors override is allowed.",
  materialDefinitions,
);
requireContract(
  materialUsages >= 10,
  "material-usage",
  "Interface surfaces must consume the shared material token.",
  { actual: materialUsages },
);
requireContract(
  styleSource.includes("backdrop-filter: blur(24px)")
    && styleSource.includes("-webkit-backdrop-filter: blur(24px)"),
  "material-blur",
  "MATERIAL / 01 needs the 24px standard and WebKit fallback.",
);
requireContract(
  duplicateMaterialSurfaces.length === 0
    && missingMaterialSurfaces.length === 0
    && unexpectedMaterialSurfaces.length === 0,
  "material-surface-registry",
  "Every interface surface must appear exactly once in the explicit material registry.",
  {
    actual: materialSurfaceNames,
    duplicate: [...new Set(duplicateMaterialSurfaces)],
    missing: missingMaterialSurfaces,
    unexpected: unexpectedMaterialSurfaces,
  },
);
requireContract(
  invalidMaterialModes.length === 0,
  "material-surface-mode",
  "Every registered material surface needs an always, desktop, or mobile activation mode.",
  invalidMaterialModes,
);
requireContract(
  missingDynamicMaterialSurfaces.length === 0,
  "material-dynamic-surface-registry",
  "Runtime-generated interface surfaces must register their shared material family and activation mode.",
  missingDynamicMaterialSurfaces.map(({ name }) => name),
);
requireContract(
  materialCascadeIndex >= styleSource.length * 0.9
    && /\[data-material-surface\]\[data-material-active="always"\][\s\S]*?background:\s*var\(--material-01\)/.test(materialCascadeSource)
    && /\[data-material-surface\]\[data-material-active="desktop"\][\s\S]*?background:\s*var\(--material-01\)/.test(materialCascadeSource)
    && /\[data-material-surface\]\[data-material-active="mobile"\][\s\S]*?background:\s*var\(--material-01\)/.test(materialCascadeSource)
    && /box-shadow:\s*none/.test(materialCascadeSource)
    && /backdrop-filter:\s*blur\(24px\)/.test(materialCascadeSource)
    && /-webkit-backdrop-filter:\s*blur\(24px\)/.test(materialCascadeSource),
  "material-cascade-contract",
  "The final cascade must enforce MATERIAL / 01 for every active registered surface.",
);

const mapNodeLabelRules = [
  ...styleSource.matchAll(/(?:^|\n)\.map-node-label\s*\{([^}]*)\}/g),
].map((match) => match[1]);
const finalMapNodeLabelRule = [...mapNodeLabelRules]
  .reverse()
  .find((rule) => rule.includes("background: var(--material-01)")) ?? "";
requireContract(
  /display:\s*inline-flex/.test(finalMapNodeLabelRule)
    && /align-items:\s*center/.test(finalMapNodeLabelRule)
    && /padding:\s*6px 9px/.test(finalMapNodeLabelRule)
    && /background:\s*var\(--material-01\)/.test(finalMapNodeLabelRule)
    && /backdrop-filter:\s*blur\(24px\)/.test(finalMapNodeLabelRule)
    && /-webkit-backdrop-filter:\s*blur\(24px\)/.test(finalMapNodeLabelRule),
  "material-map-label-family",
  "Map labels need one symmetric, optically centred MATERIAL / 01 construction.",
);
requireContract(
  indexSource.includes('class="map-labels" data-map-labels aria-hidden="true"')
    && scriptSource.includes('const mapLabelsRoot = document.querySelector("[data-map-labels]");')
    && scriptSource.includes("button.append(glyph);")
    && scriptSource.includes("mapLabelsRoot?.append(label);")
    && !scriptSource.includes("button.append(glyph, label);"),
  "material-map-label-compositing",
  "Map labels need a dedicated sibling layer so MATERIAL / 01 can blur the map instead of inheriting each transformed node.",
);

const originLabelRules = [
  ...styleSource.matchAll(/(?:^|\n)\.origin-marker__label\s*\{([^}]*)\}/g),
].map((match) => match[1]);
const originLabelMaterialRule = originLabelRules.find((rule) => (
  rule.includes("background: var(--material-01)")
)) ?? "";
const coordinateLabelGeometryRule = (
  styleSource.match(
    /(?:^|\n)\.map-axis-label,\s*\n\.origin-marker__label\s*\{([^}]*)\}/,
  )?.[1] ?? ""
);
requireContract(
  originLabelRules.length >= 1
    && /background:\s*var\(--material-01\)/.test(originLabelMaterialRule)
    && /backdrop-filter:\s*blur\(24px\)/.test(originLabelMaterialRule)
    && /-webkit-backdrop-filter:\s*blur\(24px\)/.test(originLabelMaterialRule)
    && !originLabelRules.some((rule) => /background:\s*color-mix/.test(rule)),
  "material-origin-label",
  "The origin label must use only MATERIAL / 01; historical local backdrops are forbidden.",
);
requireContract(
  /padding:\s*4px 6px/.test(coordinateLabelGeometryRule)
    && /margin:\s*0/.test(coordinateLabelGeometryRule)
    && /border:\s*0/.test(coordinateLabelGeometryRule)
    && /border-radius:\s*12px/.test(coordinateLabelGeometryRule)
    && /corner-shape:\s*var\(--corner-card-shape\)/.test(
      coordinateLabelGeometryRule,
    )
    && /line-height:\s*1/.test(coordinateLabelGeometryRule)
    && !originLabelRules.some((rule) => /min-height:/.test(rule)),
  "coordinate-label-geometry",
  "The observation route must keep the same small coordinate silhouette as the axis labels.",
);

const controlConsoleStart = indexSource.indexOf('class="control-console"');
const commandFormEnd = indexSource.indexOf("</form>", controlConsoleStart);
const controlConsoleEnd = indexSource.indexOf("</div>", commandFormEnd);
const commandResultsStart = indexSource.indexOf('class="command-results"');
requireContract(
  controlConsoleStart !== -1
    && commandFormEnd !== -1
    && controlConsoleEnd !== -1
    && commandResultsStart > controlConsoleEnd,
  "material-search-detached",
  "Search results must remain outside the console material ancestor.",
);
requireContract(
  scriptSource.includes("positionDetachedCommandResults")
    && scriptSource.includes('commandResults?.classList.toggle("is-open", isOpen)'),
  "material-search-positioning",
  "Detached search results need explicit positioning and open-state synchronization.",
);
requireContract(
  !styleSource.includes(".control-console .command-results")
    && !styleSource.includes(".command-dock.is-open .command-results"),
  "material-search-legacy-selector",
  "Historical descendant selectors must not reconnect search results to a material ancestor.",
);

const mobileNavigationStart = indexSource.indexOf('class="constellation-nav"');
const mobileNavigationEnd = indexSource.indexOf("</nav>", mobileNavigationStart);
const mobileNavigationSource = mobileNavigationStart === -1 || mobileNavigationEnd === -1
  ? ""
  : indexSource.slice(mobileNavigationStart, mobileNavigationEnd + "</nav>".length);
const mobileNavigationItems = [
  ...mobileNavigationSource.matchAll(/\sdata-nav-view="([^"]+)"/g),
].map((match) => match[1]);
const mobileNavigationLabels = [
  ...mobileNavigationSource.matchAll(/class="constellation-nav__label">([^<]+)</g),
].map((match) => match[1].trim());

requireContract(
  mobileNavigationSource.includes('data-navigation-pattern="disclosed-route-list"')
    && mobileNavigationSource.includes('aria-label="Основная навигация"')
    && mobileNavigationSource.includes('aria-expanded="false"')
    && mobileNavigationSource.includes('aria-controls="constellation-nav-orbit"')
    && mobileNavigationSource.includes('id="constellation-nav-orbit"'),
  "mobile-navigation-disclosure",
  "Mobile routes need one labelled navigation disclosure with explicit expanded state and control ownership.",
);
requireContract(
  mobileNavigationItems.length === 5
    && new Set(mobileNavigationItems).size === 5
    && mobileNavigationLabels.length === 5
    && mobileNavigationSource.includes('aria-current="page"'),
  "mobile-navigation-visible-routes",
  "The disclosed mobile navigation must expose five uniquely named routes and identify the current route.",
  {
    items: mobileNavigationItems,
    labels: mobileNavigationLabels,
  },
);
requireContract(
  !/<select\b|role="listbox"|aria-selected=/i.test(mobileNavigationSource),
  "mobile-navigation-not-form-dropdown",
  "Primary navigation must remain semantic navigation, not a form dropdown or listbox.",
);
requireContract(
  scriptSource.includes("if (isConstellationNavOpen)")
    && scriptSource.includes("setConstellationNavOpen(false);")
    && scriptSource.includes("constellationNavToggle?.focus();"),
  "mobile-navigation-escape-return",
  "Escape must close the mobile navigation and return focus to its disclosure button.",
);
requireContract(
  indexSource.includes('data-content-media="project-reel"')
    && !/<[^>]*data-content-media="project-reel"[^>]*data-material-surface=/s.test(indexSource)
    && !/<[^>]*data-material-surface=[^>]*data-content-media="project-reel"/s.test(indexSource),
  "material-media-boundary",
  "Project reels are unframed content media and must not enter the interface material registry.",
);

const motionTokens = ["enter", "exit", "shift"];
for (const token of motionTokens) {
  requireContract(
    new RegExp(`--motion-${token}:\\s*cubic-bezier\\(`).test(styleSource),
    "motion-token",
    `Missing --motion-${token} cubic-bezier token.`,
  );
  requireContract(
    styleSource.includes(`var(--motion-${token})`),
    "motion-token-unused",
    `--motion-${token} is defined but not consumed.`,
  );
}

const rawBezierValues = [...styleSource.matchAll(/cubic-bezier\([^)]*\)/g)]
  .map((match) => match[0]);
warnContract(
  rawBezierValues.length === 3,
  "motion-raw",
  "Raw cubic-bezier values exist outside the three semantic token definitions.",
  rawBezierValues,
);

for (const token of ["font-sans", "font-mono", "font-serif"]) {
  requireContract(
    new RegExp(
      `--${token}:\\s*"Golos Text",\\s*Arial,\\s*Helvetica,\\s*sans-serif`,
    ).test(styleSource),
    "font-contract",
    `${token} must resolve to the self-hosted Golos Text family with system fallbacks.`,
  );
}
requireContract(
  /--font-ascii:\s*var\(--font-sans\)/.test(styleSource),
  "font-ascii",
  "Canvas glyphs must inherit the shared Golos Text token.",
);

for (const weight of [400, 500, 600, 700]) {
  requireContract(
    new RegExp(
      `@font-face\\s*\\{[^}]*font-family:\\s*"Golos Text";`
        + `[^}]*font-weight:\\s*${weight};`
        + `[^}]*font-display:\\s*swap;`,
      "s",
    ).test(styleSource),
    "font-face-golos",
    `Golos Text weight ${weight} must be declared locally with font-display: swap.`,
  );
}

requireContract(
  /signalContext\.font\s*=\s*`\$\{fontSize\}px "Golos Text", Arial, Helvetica, sans-serif`/.test(
    scriptSource,
  ),
  "font-canvas",
  "The canvas constellation must use Golos Text with the shared system fallbacks.",
);

requireContract(
  !/IBM Plex/.test(`${indexSource}\n${scriptSource}\n${styleSource}`),
  "font-legacy",
  "Rendered source must not retain IBM Plex declarations or references.",
);

const fixedPixelFontSizes = [
  ...styleSource.matchAll(/font-size:\s*([0-9.]+px)\s*;/g),
].map((match) => match[1]);
const pureViewportFontSizes = [
  ...styleSource.matchAll(/font-size:\s*([0-9.]+(?:vw|vh|cqi|cqw))\s*;/g),
].map((match) => match[1]);
requireContract(
  pureViewportFontSizes.length === 0,
  "type-pure-viewport",
  "Readable type must not use an unbounded pure viewport unit.",
  pureViewportFontSizes,
);

const legacyFontFaces = ["IBM Plex Mono", "IBM Plex Sans", "IBM Plex Serif"].filter((family) => {
  const uses = styleSource.match(new RegExp(`font-family:\\s*"${family}"`, "g")) || [];
  return uses.length > 0
    && !styleSource.includes(`--font-sans: "${family}"`)
    && !styleSource.includes(`--font-serif: "${family}"`);
});
warnContract(
  legacyFontFaces.length === 0,
  "font-face-legacy",
  "Historical IBM Plex @font-face declarations remain candidates for cleanup.",
  legacyFontFaces,
);

requireContract(
  indexSource.includes('<html lang="ru">'),
  "document-language",
  "The document needs an explicit Russian language.",
);
requireContract(
  /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1">/.test(indexSource),
  "viewport",
  "Viewport metadata must preserve user zoom.",
);
requireContract(
  indexSource.includes('class="skip-link"')
    && indexSource.includes("skip-link--secondary"),
  "skip-links",
  "Both primary skip routes must remain available.",
);
const signalCanvasTag = indexSource.match(
  /<canvas[\s\S]*?data-signal-constellation[\s\S]*?>/m,
)?.[0] || "";
requireContract(
  signalCanvasTag.includes('aria-hidden="true"')
    && !signalCanvasTag.includes("tabindex=")
    && !signalCanvasTag.includes("role=")
    && indexSource.includes('id="map-guide"')
    && indexSource.includes('aria-describedby="map-guide"'),
  "canvas-accessibility",
  "The atmospheric signal canvas must stay decorative while the map exposes one reusable spatial guide.",
);
const navigationIndices = [
  ...indexSource.matchAll(/data-nav-index="(\d{2})"/g),
].map((match) => match[1]);
requireContract(
  navigationIndices.join(",") === "01,02,03,04,05",
  "navigation-indices",
  "Primary navigation numbering must run from 01 through 05.",
  navigationIndices,
);
requireContract(
  /<p class="brand"[^>]*>[\s\S]*ANTON GOROKHOVATSKY © 2026[\s\S]*<\/p>/.test(indexSource)
    && !/<a class="brand"/.test(indexSource),
  "brand-authorship",
  "The authorship mark must be a non-interactive bottom-corner signature with the current year.",
);
requireContract(
  indexSource.includes('data-context="ВИД"')
    && indexSource.includes('data-context="ЭКРАН"')
    && indexSource.includes("<span data-theme-label>СИСТЕМА</span>")
    && indexSource.includes('<span class="constellation-nav__heading" aria-hidden="true">РАЗДЕЛЫ</span>')
    && !/data-context="(?:VIEW|DISPLAY)"/.test(indexSource),
  "interface-localization",
  "Core controls must use the accepted Russian interface labels.",
);
requireContract(
  /class="practice-map"[\s\S]*?data-practice-map[\s\S]*?data-active-kind="all"[\s\S]*?data-active-kinds="company,project,personal,practice"[\s\S]*?>/m.test(indexSource),
  "filter-first-paint",
  "The initial map markup must expose the complete filter composition before JavaScript runs.",
);
requireContract(
  /data-map-nodes[\s\S]*?role="group"[\s\S]*?aria-label=/m.test(indexSource),
  "map-group",
  "Map nodes need a named accessibility group.",
);
requireContract(
  indexSource.includes("data-content-panel")
    && indexSource.includes('aria-hidden="true"')
    && indexSource.includes("inert"),
  "panel-inert",
  "Closed transient content must be aria-hidden and inert.",
);
requireContract(
  styleSource.includes("@media (prefers-reduced-motion: reduce)"),
  "reduced-motion",
  "The stylesheet must honor reduced motion.",
);
requireContract(
  runtimeFiles.every((path) => (
    indexSource.includes(`<script type="module" src="${path}?v=`)
  ))
    && indexSource.includes('<script type="importmap" data-runtime-import-map>')
    && scriptSource.includes('from "./preferences.js"')
    && scriptSource.includes("export {"),
  "native-es-modules",
  "Runtime files must load as native modules with explicit imports, exports, and versioned URLs.",
);
requireContract(
  runtimeFiles.includes("js/analytics.js")
    && indexSource.includes("data-analytics-consent")
    && indexSource.includes("data-analytics-allow")
    && indexSource.includes("data-analytics-deny")
    && indexSource.includes('class="ym-disable-keys"')
    && !indexSource.includes("mc.yandex.ru/watch/")
    && !indexSource.includes("metrika/tag.js?id=")
    && scriptSource.includes('analyticsPreference === "allowed"')
    && scriptSource.includes("loadYandexAnalytics()"),
  "analytics-consent",
  "Analytics must load only after an explicit choice, keep search private, and expose a reversible setting.",
);
requireContract(
  mapEvidenceById.narkomfin?.result.includes("51\u00a0420")
    && mapEvidenceById.narkomfin?.result.includes("67\u00a0893"),
  "nonbreaking-metrics",
  "Thousands-separated project metrics must remain indivisible at mobile line breaks.",
);
requireContract(
  indexSource.includes('class="no-script-fallback"')
    && indexSource.includes('aria-label="Ключевые кейсы"')
    && indexSource.includes("https://hh.ru/resume/e469b9deff00850af10039ed1f736563726574?print=true")
    && indexSource.includes("Подробное резюме в Notion")
    && indexSource.includes("mailto:anton.gorokhovatsky@gmail.com")
    && indexSource.includes("body > :not(noscript)"),
  "no-script-fallback",
  "The no-JavaScript path must expose selected work and contact routes without a tracking pixel.",
);
requireContract(
  indexSource.match(/data-map-point="[^"]+"/g)?.length === 8
    && indexSource.includes("КЛЮЧЕВЫЕ <span>КЕЙСЫ</span>")
    && scriptSource.includes('source: "cases"')
    && scriptSource.includes("evidence.task")
    && scriptSource.includes("evidence.role")
    && scriptSource.includes("evidence.result"),
  "employer-case-route",
  "The employer route must expose eight evidence-backed cases and index task, role, and result text.",
);
requireContract(
  scriptSource.includes("if (document.hidden)")
    && scriptSource.includes('root.dataset.faviconMotion = "animated"')
    && scriptSource.includes("frameInterval = document.hidden ? 240 : 80"),
  "favicon-hidden-lifecycle",
  "Variant 01 must remain visibly animated in foreground and background tabs.",
);
requireContract(
  indexSource.includes("document.documentElement.dataset.themeMode = themeMode")
    && scriptSource.includes('themeMode === "system"')
    && scriptSource.includes('window.localStorage.removeItem("anton-signal-theme")')
    && scriptSource.includes('systemTheme.addEventListener?.("change"'),
  "system-theme-mode",
  "Theme controls must offer a reversible system mode and react to operating-system changes.",
);
warnContract(
  styleSource.includes("@media (forced-colors: active)"),
  "forced-colors",
  "No explicit forced-colors audit layer exists yet.",
);
warnContract(
  styleSource.includes("prefers-contrast"),
  "prefers-contrast",
  "No explicit prefers-contrast handling exists yet.",
);

requireContract(
  cname === "gorokhovatsky.tech",
  "custom-domain",
  "CNAME must keep the production domain.",
  cname,
);
const canonical = indexSource.match(/<link rel="canonical" href="([^"]+)">/)?.[1] || "";
const ogUrl = indexSource.match(/<meta property="og:url" content="([^"]+)">/)?.[1] || "";
const documentTitle = indexSource.match(/<title>([^<]+)<\/title>/)?.[1] || "";
const metaDescription = indexSource.match(
  /<meta\s+name="description"\s+content="([^"]+)"/,
)?.[1] || "";
const ogTitle = indexSource.match(
  /<meta\s+property="og:title"\s+content="([^"]+)"/,
)?.[1] || "";
const ogDescription = indexSource.match(
  /<meta\s+property="og:description"\s+content="([^"]+)"/,
)?.[1] || "";
const ogImage = indexSource.match(
  /<meta\s+property="og:image"\s+content="([^"]+)"/,
)?.[1] || "";
const ogImageAlt = indexSource.match(
  /<meta\s+property="og:image:alt"\s+content="([^"]+)"/,
)?.[1] || "";
const twitterTitle = indexSource.match(
  /<meta\s+name="twitter:title"\s+content="([^"]+)"/,
)?.[1] || "";
const twitterDescription = indexSource.match(
  /<meta\s+name="twitter:description"\s+content="([^"]+)"/,
)?.[1] || "";
const twitterImage = indexSource.match(
  /<meta\s+name="twitter:image"\s+content="([^"]+)"/,
)?.[1] || "";
warnContract(
  canonical === "https://gorokhovatsky.tech/" && ogUrl === canonical,
  "metadata-domain",
  "Canonical and Open Graph URL still need the planned production-domain pass.",
  { canonical, ogUrl },
);
requireContract(
  documentTitle.length > 0
    && documentTitle === ogTitle
    && documentTitle === twitterTitle,
  "metadata-title-coherence",
  "Document, Open Graph, and Twitter titles must remain identical.",
  { documentTitle, ogTitle, twitterTitle },
);
requireContract(
  metaDescription.length >= 110
    && metaDescription.length <= 180
    && metaDescription === ogDescription
    && metaDescription === twitterDescription,
  "metadata-description-coherence",
  "The primary, Open Graph, and Twitter descriptions must share one useful summary.",
  {
    length: metaDescription.length,
    metaDescription,
    ogDescription,
    twitterDescription,
  },
);
requireContract(
  ogImage === twitterImage
    && /^https:\/\/gorokhovatsky\.tech\/assets\/og-signal\.jpg\?v=/.test(ogImage)
    && ogImageAlt.length >= 60
    && indexSource.includes('<meta property="og:image:width" content="1200">')
    && indexSource.includes('<meta property="og:image:height" content="630">'),
  "metadata-share-image",
  "The 1200×630 share image, its cache key, and its meaningful text alternative must stay coherent.",
  { ogImage, twitterImage, ogImageAlt },
);

const requiredStates = [
  "map-idle",
  "garage-selected",
  "project-reel",
  "search-match",
  "search-empty",
  "panel-work",
  "panel-approach",
  "panel-contact",
  "mobile-nav-open",
  "keyboard-focus",
  "reduced-motion",
  "forced-colors",
  "text-zoom",
  "settings-panel",
  "analytics-consent",
  "no-script",
  "favicon-hidden",
];
requireContract(
  existsSync(stateMatrixPath),
  "state-matrix-missing",
  "docs/ui-state-matrix.md is required as the static UI workbench.",
);
requireContract(
  requiredStates.every((state) => stateMatrixSource.includes(`\`${state}\``)),
  "state-matrix-incomplete",
  "The UI state matrix is missing one or more release states.",
  requiredStates.filter((state) => !stateMatrixSource.includes(`\`${state}\``)),
);

const requiredAgentEvalCases = [
  "search-intent",
  "settings-space",
  "focus-language",
  "analytics-copy",
  "destination-scope",
  "filter-aggregate",
  "filter-feedback",
  "map-entity",
  "new-surface",
];
requireContract(
  existsSync(agentEvalsPath),
  "agent-evals-missing",
  "docs/agent-evals.md is required for recurring agent-generated UI work.",
);
requireContract(
  requiredAgentEvalCases.every((id) => agentEvalsSource.includes(`\`${id}\``)),
  "agent-evals-incomplete",
  "The agent eval catalog is missing one or more representative intent-level cases.",
  requiredAgentEvalCases.filter((id) => !agentEvalsSource.includes(`\`${id}\``)),
);

const codeReferences = `${indexSource}\n${scriptSource}`;
const ignoredClassLikeExtensions = new Set([
  "com",
  "html",
  "jpg",
  "life",
  "mp4",
  "net",
  "org",
  "png",
  "ru",
  "site",
  "store",
  "tech",
  "woff2",
]);
const cssClassNames = [
  ...new Set(
    [...styleSource.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)]
      .map((match) => match[1])
      .filter((name) => !ignoredClassLikeExtensions.has(name)),
  ),
].sort();
const runtimeGeneratedClassNames = new Set(
  [
    ...Object.keys(kindCounts).flatMap((kind) => [
      `map-node--${kind}`,
      `map-speck--${kind}`,
    ]),
    ...["context", "detail"].map(
      (slot) => `map-hover-preview__mosaic-slot--${slot}`,
    ),
  ],
);
const unreferencedClassCandidates = cssClassNames
  .filter((name) => !codeReferences.includes(name))
  .filter((name) => !runtimeGeneratedClassNames.has(name))
  .slice(0, 80);

const summary = {
  errors: findings.filter(({ level }) => level === "error").length,
  warnings: findings.filter(({ level }) => level === "warning").length,
};
const report = {
  schemaVersion: 1,
  status: summary.errors > 0
    ? "fail"
    : summary.warnings > 0
      ? "review"
      : "pass",
  summary,
  map: {
    total: mapItems.length,
    countsByKind: kindCounts,
    garageSize: garage?.size ?? null,
    maximumSize,
    connections: mapItems.filter((item) => item.parent).length,
  },
  reels: {
    files: reelFiles,
    references: reelReferences,
  },
  designSystem: {
    materialDefinitions,
    materialUsages,
    materialSurfaces: [
      ...materialSurfaceTags.map(({ name, mode }) => ({ name, mode })),
      ...dynamicMaterialSurfaces.map(({ name }) => ({ name, mode: "always", source: "runtime" })),
    ],
    backdropInventory,
    rawBezierValues,
    fixedPixelFontSizeDeclarations: fixedPixelFontSizes.length,
    pureViewportFontSizes,
  },
  runtime: {
    files: runtimeFiles,
  },
  accessibility: {
    stateMatrix: relative(projectRoot, stateMatrixPath),
    reducedMotion: styleSource.includes("@media (prefers-reduced-motion: reduce)"),
    forcedColors: styleSource.includes("@media (forced-colors: active)"),
    prefersContrast: styleSource.includes("prefers-contrast"),
  },
  cleanupCandidates: {
    note: "Static candidates only. Confirm with computed styles, runtime states, and matched renders before deletion.",
    unreferencedClasses: unreferencedClassCandidates,
  },
  findings,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `Project audit: ${report.status.toUpperCase()} `
    + `(${summary.errors} errors, ${summary.warnings} warnings)`,
  );
  console.log(
    `Map: ${report.map.total} nodes; `
    + `${report.map.connections} relations; `
    + `${report.map.countsByKind.practice} principles; `
    + `${report.reels.files.length} reels.`,
  );
  console.log(
    `Design inventory: ${materialUsages} MATERIAL / 01 uses; `
    + `${Object.keys(backdropInventory).length} historical backdrop values; `
    + `${fixedPixelFontSizes.length} fixed px font-size declarations.`,
  );
  console.log(
    `Cleanup inventory: ${unreferencedClassCandidates.length} class candidates `
    + `(confirmation required before deletion).`,
  );

  for (const finding of findings) {
    console.log(
      `[${finding.level.toUpperCase()}] ${finding.code}: ${finding.message}`,
    );
    if (finding.details !== undefined) {
      console.log(`  ${JSON.stringify(finding.details)}`);
    }
  }
}

if (summary.errors > 0 || (strictMode && summary.warnings > 0)) {
  process.exit(1);
}
