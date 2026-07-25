#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const jsonOutput = process.argv.includes("--json");
const strictMode = process.argv.includes("--strict");

const readProjectFile = (path) => readFileSync(join(projectRoot, path), "utf8");
const indexSource = readProjectFile("index.html");
const scriptSource = readProjectFile("script.js");
const styleSource = readProjectFile("styles.css");
const cname = readProjectFile("CNAME").trim();
const stateMatrixPath = join(projectRoot, "docs", "ui-state-matrix.md");
const stateMatrixSource = existsSync(stateMatrixPath)
  ? readFileSync(stateMatrixPath, "utf8")
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
  const start = scriptSource.indexOf(declaration);
  const endMarker = "\n];\n\nconst mapNodesRoot";

  requireContract(
    start !== -1,
    "map-data-missing",
    "Could not find the mapItems declaration in script.js.",
  );

  if (start === -1) {
    return [];
  }

  const literalStart = start + declaration.length;
  const markerIndex = scriptSource.indexOf(endMarker, literalStart);

  requireContract(
    markerIndex !== -1,
    "map-data-end-missing",
    "Could not find the end of the mapItems declaration.",
  );

  if (markerIndex === -1) {
    return [];
  }

  const literal = scriptSource.slice(literalStart, markerIndex + 2);

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

const mapItems = extractMapItems();
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
  reelFiles.length === 13,
  "reel-count",
  "The master reel set must contain 13 videos.",
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

const materialDefinitions = [...styleSource.matchAll(/--material-01:\s*([^;]+);/g)]
  .map((match) => match[1].replace(/\s+/g, " ").trim());
const materialThemeDefinitions = materialDefinitions.filter((value) => (
  /rgba\([^)]*,\s*0\.5\)/.test(value)
));
const materialAccessibilityDefinitions = materialDefinitions.filter((value) => value === "Canvas");
const materialUsages = (styleSource.match(/var\(--material-01\)/g) || []).length;
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
    new RegExp(`--${token}:\\s*Arial,\\s*Helvetica,\\s*sans-serif`).test(styleSource),
    "font-contract",
    `${token} must resolve to Arial/Helvetica.`,
  );
}
requireContract(
  /--font-ascii:\s*"IBM Plex Mono"/.test(styleSource),
  "font-ascii",
  "ASCII geometry must retain the dedicated IBM Plex Mono token.",
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

const legacyFontFaces = ["IBM Plex Sans", "IBM Plex Serif"].filter((family) => {
  const uses = styleSource.match(new RegExp(`font-family:\\s*"${family}"`, "g")) || [];
  return uses.length > 0
    && !styleSource.includes(`--font-sans: "${family}"`)
    && !styleSource.includes(`--font-serif: "${family}"`);
});
warnContract(
  legacyFontFaces.length === 0,
  "font-face-legacy",
  "Historical non-ASCII @font-face declarations remain candidates for cleanup.",
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
requireContract(
  /<canvas[\s\S]*?role="img"[\s\S]*?tabindex="0"[\s\S]*?aria-label=/m.test(indexSource),
  "canvas-accessibility",
  "The signal canvas needs role=img, keyboard focus, and a text alternative.",
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
warnContract(
  canonical === "https://gorokhovatsky.tech/" && ogUrl === canonical,
  "metadata-domain",
  "Canonical and Open Graph URL still need the planned production-domain pass.",
  { canonical, ogUrl },
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
  Object.keys(kindCounts).flatMap((kind) => [
    `map-node--${kind}`,
    `map-speck--${kind}`,
  ]),
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
    backdropInventory,
    rawBezierValues,
    fixedPixelFontSizeDeclarations: fixedPixelFontSizes.length,
    pureViewportFontSizes,
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
