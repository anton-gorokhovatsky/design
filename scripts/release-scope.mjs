#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJs } from "acorn";
import { parse as parseHtml } from "parse5";
import { cacheVersionFiles } from "./cache-versions.mjs";
import { affectedComponents } from "./component-scope.mjs";
import { isMediaOnly, mediaAssetPaths } from "./media-scope.mjs";
import { ownedCheckComponent, staticCheckPaths, staticScopeFor } from "./check-profiles.mjs";
import { browserMatrix } from "./check-catalog.mjs";
import { pointAddressPaths, pointAddressRename } from "./point-address-scope.mjs";

// Only display fields in these data arrays are copy. Selectors, destinations,
// identifiers, search rules, expressions and every other byte remain protected.
const copyArrays = {
  "js/panels.js": { name: "commandViews", fields: ["title", "meta"] },
  "js/map-data.js": {
    name: "mapItems", fields: ["label", "mapLabel", "title", "meta", "description", "timeLabel", "kindLabel", "linkLabel"],
  },
  "js/observation-route.js": {
    name: "observationSteps", fields: ["title", "meta", "description"],
  },
};
const shareIds = ["garage", "narkomfin", "tarski", "doronin", "eleven", "shirokostup"];
const sharePages = new Set(shareIds.map(id => `work/${id}/index.html`));
// These existing JPEGs are static publication artwork, checked for format and size
// by check-publication-assets. Runtime media never enters this boundary.
const shareImages = new Set(shareIds.map(id => `assets/share/${id}.jpg`));
const focusedHomePaths = new Set(["js/focused-home.js", "rendering/js/focused-home.js"]);
const evidenceFields = new Set(["task", "role", "idea", "result", "feature", "details", "weather", "timePreview", "technical"]);
const keyOf = (property) => !property.computed && (property.key?.name ?? property.key?.value);
const isString = (node) => node?.type === "Literal" && typeof node.value === "string";
const maskRanges = (source, ranges) => ranges
  .sort((a, b) => b[0] - a[0])
  .reduce((text, [start, end]) => text.slice(0, start) + "\0COPY\0" + text.slice(end), source);
const displayRanges = (object, fields, offset = 0) => object?.type === "ObjectExpression"
  ? object.properties.flatMap((property) => (
    property.type === "Property" && property.kind === "init" && !property.method
    && fields.has(keyOf(property)) && isString(property.value)
      ? [[property.value.start + offset, property.value.end + offset]] : []
  )) : [];

const maskJavaScriptCopy = (path, source) => {
  const { name, fields } = copyArrays[path];
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const ranges = tree.body.flatMap((statement) => {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") return [];
    return declaration.declarations.flatMap((item) => (
      item.id.type === "Identifier" && item.id.name === name && item.init?.type === "ArrayExpression"
        ? item.init.elements.flatMap((object) => displayRanges(object, new Set(fields))) : []
    ));
  });
  return maskRanges(source, ranges);
};

// Deferred editorial text and the reviewed tuple-to-ID migration. Routes,
// identities, order, figure data and evidence metadata remain protected.
const isCaseContentCopy = (before, after, allowMigration = false) => {
  const parse = source => {
    const data = JSON.parse(source);
    const visit = node => {
      if (node.type === "ObjectExpression") {
        const keys = node.properties.map(keyOf);
        if (new Set(keys).size !== keys.length) throw new Error("Duplicate case-content keys");
        node.properties.forEach(property => visit(property.value));
      } else if (node.type === "ArrayExpression") node.elements.forEach(visit);
    };
    visit(parseJs(`(${source})`, { ecmaVersion: "latest" }).body[0].expression);
    return data;
  };
  const left = parse(before), right = parse(after);
  const relatedIds = related => Object.fromEntries(Object.entries(related || {}).map(([id, entries]) => {
    if (!Array.isArray(entries)) throw new Error("Unknown related list");
    return [id, entries.map(entry => {
      if (typeof entry === "string") return entry;
      if (Array.isArray(entry) && entry.length === 2 && entry.every(value => typeof value === "string")
        && (!entry[1].trim() || maskHtmlCopy(entry[1]) === "\0COPY\0")) return entry[0];
      throw new Error("Unknown related target");
    })];
  }));
  const shapes = data => new Set(Object.values(data.related || {}).flat().map(entry => Array.isArray(entry) ? "tuple" : "id"));
  const leftShapes = shapes(left), rightShapes = shapes(right);
  // The one-way migration is atomic across the lists. The new renderer must
  // never receive old tuples again, including in a mixed-format list.
  if (leftShapes.size > 1 || rightShapes.size > 1 || (leftShapes.has("id") && rightShapes.has("tuple"))) return false;
  const migrated = leftShapes.has("tuple") && rightShapes.has("id");
  const addedCaptions = !Object.hasOwn(left, "relatedCaptions") && Object.hasOwn(right, "relatedCaptions");
  if ((migrated || addedCaptions) && !allowMigration) return false;
  const leftIds = relatedIds(left.related);
  const knownIds = new Set([...Object.keys(left.descriptions || {}), ...Object.keys(left.evidence || {}),
    ...Object.keys(leftIds), ...Object.values(leftIds).flat()]);
  const normalize = data => {
    // Preserve markup and hrefs inside existing rich-text strings as well.
    const display = value => !value.trim() ? "\0COPY\0" : maskHtmlCopy(value);
    for (const [id, value] of Object.entries(data.descriptions || {})) {
      if (typeof value === "string") data.descriptions[id] = display(value);
    }
    for (const record of Object.values(data.evidence || {})) {
      for (const field of evidenceFields) if (typeof record?.[field] === "string") record[field] = display(record[field]);
    }
    if (Object.hasOwn(data, "related")) data.related = relatedIds(data.related);
    if (Object.hasOwn(data, "relatedCaptions")) {
      const captions = data.relatedCaptions;
      if (!captions || Array.isArray(captions) || typeof captions !== "object") throw new Error("Unknown captions");
      for (const [id, value] of Object.entries(captions)) {
        if (!knownIds.has(id) || typeof value !== "string" || display(value) !== "\0COPY\0") throw new Error("Unknown caption");
        captions[id] = "\0COPY\0";
      }
    }
    return data;
  };
  const hadCaptions = Object.hasOwn(left, "relatedCaptions");
  normalize(left); normalize(right);
  // The first migration adds only captions for already known targets. Later
  // copy edits preserve its keys; an empty value deliberately hides a caption.
  if (!hadCaptions) delete right.relatedCaptions;
  return JSON.stringify(left) === JSON.stringify(right);
};

// Only the display names in the known landmark tuples; identifiers, direction
// labels and executable code stay byte-for-byte protected in both source builds.
const maskLandmarkCopy = (source) => {
  const keys = ["garage", "narkomfin", "private-practice", "eleven", "ks-fish", "principle-data-intuition", "running", "youtube"];
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const ranges = tree.body.flatMap(statement => statement.type === "VariableDeclaration"
    ? statement.declarations.flatMap(({ init }) => {
      if (init?.type !== "ObjectExpression" || init.properties.map(keyOf).join() !== keys.join()) return [];
      if (!init.properties.every(property => property.type === "Property" && property.kind === "init"
        && !property.method && property.value.type === "ArrayExpression"
        && property.value.elements.length === 2 && property.value.elements.every(isString))) return [];
      return init.properties.map(property => [property.value.elements[1].start, property.value.elements[1].end]);
    }) : []);
  return maskRanges(source, ranges);
};

const maskHtmlCopy = (source, publication = false) => {
  const ranges = [];
  const visit = (node) => {
    const location = node.sourceCodeLocation;
    const attributes = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    if (node.tagName === "script") {
      if (attributes.type === "application/json" && attributes.id === "map-evidence-data") {
        const start = location.startTag.endOffset;
        const json = source.slice(start, location.endTag.startOffset);
        JSON.parse(json); // Reject JS masquerading as JSON before using its source positions.
        const object = parseJs(`(${json})`, { ecmaVersion: "latest" }).body[0].expression;
        for (const property of object.properties) {
          ranges.push(...displayRanges(property.value, evidenceFields, start - 1));
        }
      }
      if (publication && attributes.type === "application/ld+json") {
        const start = location.startTag.endOffset;
        const json = source.slice(start, location.endTag.startOffset);
        JSON.parse(json);
        const object = parseJs(`(${json})`, { ecmaVersion: "latest" }).body[0].expression;
        ranges.push(...displayRanges(object, new Set(["name"]), start - 1));
      }
      return;
    }
    if (["style", "template", "noscript"].includes(node.tagName)) return;
    if (node.nodeName === "#text" && location && node.value.trim()) {
      ranges.push([location.startOffset, location.endOffset]);
    }
    const displayAttributes = ["aria-label", "title", "alt", "placeholder"];
    if (publication && node.tagName === "meta" && ["description", "og:title", "og:description", "og:image:alt", "twitter:title", "twitter:description", "twitter:image:alt"].includes(attributes.name || attributes.property)) displayAttributes.push("content");
    if (node.attrs?.some(attribute => attribute.name === "data-floating-console")) displayAttributes.push("data-context");
    for (const name of displayAttributes) {
      const attribute = location?.attrs?.[name];
      if (!attribute) continue;
      const raw = source.slice(attribute.startOffset, attribute.endOffset);
      // Preserve the name, equals sign and quotes; changing tag structure is full scope.
      const match = /^[-\w]+\s*=\s*(["'])([\s\S]*)\1$/.exec(raw);
      if (match) {
        const start = attribute.startOffset + raw.indexOf(match[1]) + 1;
        ranges.push([start, attribute.endOffset - 1]);
      }
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parseHtml(source, { sourceCodeLocationInfo: true }));
  let masked = maskRanges(source, ranges);
  for (const path of cacheVersionFiles) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    masked = masked.replace(new RegExp(`(["'](?:\\./|/)?${escaped}\\?v=)[a-f0-9]{12}(?=["'])`, "g"), "$1\0HASH\0");
  }
  return masked;
};

export const isCopyOnly = (path, before, after) => {
  if (before === after) return true;
  if (["README.md", "AGENTS.md"].includes(path) || /^docs\/[^\n]+\.md$/.test(path)) return true;
  // Mask tokens cannot collide with a source expression or literal URL.
  if (before.includes("\0") || after.includes("\0")) return false;
  try {
    if (copyArrays[path]) return maskJavaScriptCopy(path, before) === maskJavaScriptCopy(path, after);
    if (focusedHomePaths.has(path)) return maskLandmarkCopy(before) === maskLandmarkCopy(after);
    if (sharePages.has(path)) return maskHtmlCopy(before, true) === maskHtmlCopy(after, true);
    if (path === "js/case-content.json") return isCaseContentCopy(before, after);
    if (["index.html", "404.html", "assets/map-story/content.html"].includes(path)) return maskHtmlCopy(before) === maskHtmlCopy(after);
  } catch {
    // Syntax errors and unrecognised forms never opt out of full checks.
  }
  return false;
};

export const classifyChange = (path, before, after) => {
  if (staticCheckPaths.has(path)) return { mode: "copy", components: [] };
  if (path === "assets/map-story/content.html" && isCopyOnly(path, before, after)) return { mode: "copy", components: [] };
  if (["js/map-story.js", "rendering/js/map-story.js"].includes(path)) {
    const components = affectedComponents(path, before, after, maskHtmlCopy);
    if (components) return { mode: "components", components };
  }
  const owner = ownedCheckComponent(path);
  if (owner) return { mode: "components", components: [owner] };
  if (isCopyOnly(path, before, after)) return { mode: "copy", components: [] };
  if (path === "js/case-content.json") {
    try {
      if (isCaseContentCopy(before, after, true)) return { mode: "components", components: ["check:inspector-links", "check:case-view"] };
    } catch { /* Invalid data cannot inherit the caption migration boundary. */ }
  }
  if (isMediaOnly(path, before, after, isCopyOnly)) return {
    mode: "components",
    components: isMediaOnly(path, before, after, isCopyOnly, false)
      ? ["media"] : ["media", "check:inspector-links"],
  };
  const components = affectedComponents(path, before, after, maskHtmlCopy);
  return { mode: components ? "components" : "full", components: components || [] };
};

export const requireReleaseBase = (plan, includeUnpublished = false) => {
  if (!plan.base) throw new Error(`Cannot verify the published baseline: ${plan.reason}`);
  if (plan.files.length && !includeUnpublished) {
    throw new Error(`HEAD contains unpublished changes: ${plan.files.join(", ")}. `
      + "Isolate a small fix from origin/gh-pages, or pass --include-unpublished to continue an intentional combined release. Nothing was pushed.");
  }
};

export const planRelease = ({ projectRoot, base = "origin/gh-pages", target } = {}) => {
  const git = (...args) => execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    const baseSha = git("rev-parse", "--verify", `${base}^{commit}`).trim();
    const targetSha = target ? git("rev-parse", "--verify", `${target}^{commit}`).trim() : null;
    // Compare everything not yet published, not merely HEAD^ or the last push.
    const entries = git("diff", "--name-status", "--no-renames", "-z", baseSha, ...(targetSha ? [targetSha] : []), "--")
      .split("\0").filter(Boolean);
    let pointRename = null;
    if (entries.includes("js/map-data.js")) {
      try {
        pointRename = pointAddressRename(Object.fromEntries(pointAddressPaths.map(path => [path, {
          before: git("show", `${baseSha}:${path}`),
          after: targetSha ? git("show", `${targetSha}:${path}`) : readFileSync(resolve(projectRoot, path), "utf8"),
        }])));
      } catch { /* Missing owners cannot prove an address-only rename. */ }
    }
    const changes = [];
    for (let index = 0; index < entries.length; index += 2) {
      const [status, path] = entries.slice(index, index + 2);
      const owner = ownedCheckComponent(path);
      let classification = staticCheckPaths.has(path) ? { mode: "copy", components: [] } : owner ? { mode: "components", components: [owner] } : { mode: "full", components: [] };
      if (status === "M" && (copyArrays[path] || sharePages.has(path) || focusedHomePaths.has(path) || ["js/case-content.json", "js/case-view.js", "js/map-story.js", "rendering/js/map-story.js", "index.html", "404.html", "assets/map-story/content.html", "styles.css", "js/focused-home.js", "js/map-media.js", "js/map-engine.js", "rendering/js/map-engine.js", "js/spatial-home.js", "rendering/js/spatial-home.js", "js/whoop-day.js", "js/practice-orbits.js", "rendering/practice-orbits.js", "js/viewport-ui.js", "rendering/js/viewport-ui.js", "scripts/browser-contracts.cjs", "scripts/reel-specs.json", "README.md", "AGENTS.md"].includes(path) || /^docs\/.*\.md$/.test(path))) {
        const before = git("show", `${baseSha}:${path}`);
        const after = targetSha ? git("show", `${targetSha}:${path}`) : readFileSync(resolve(projectRoot, path), "utf8");
        classification = classifyChange(path, before, after);
      }
      if (status === "M" && shareImages.has(path)) classification = { mode: "copy", components: [] };
      if (status === "M" && mediaAssetPaths.has(path)) classification = { mode: "components", components: ["media"] };
      if (status === "M" && pointRename?.paths.includes(path)) classification = { mode: "components", components: ["point-address"] };
      changes.push({ path, ...classification });
    }
    if (!targetSha) {
      changes.push(...git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)
        .map((path) => { const owner = ownedCheckComponent(path); return staticCheckPaths.has(path) ? { path, mode: "copy", components: [] } : { path, mode: owner ? "components" : "full", components: owner ? [owner] : [] }; }));
    }
    const fullPaths = changes.filter(({ mode }) => mode === "full").map(({ path }) => path);
    const components = [...new Set(changes.flatMap(({ components }) => components))].sort();
    const mode = fullPaths.length ? "full" : components.length ? "components" : "copy";
    const selectedStaticScope = staticScopeFor(mode, components);
    const processContracts = changes.some(({ path }) => staticCheckPaths.has(path) && ownedCheckComponent(path) === "checks");
    // A signature-only browser matrix still needs process contracts when its
    // release tooling changed. The existing checks profile contains both.
    const staticScope = selectedStaticScope === "signature" && processContracts ? "checks" : selectedStaticScope;
    return {
      mode, staticScope, base: baseSha, components, matrix: browserMatrix(mode, components),
      pointAddresses: pointRename ? [{ from: pointRename.from, to: pointRename.to }] : [],
      reason: fullPaths.length ? `Shared or unclassified changes: ${fullPaths.join(", ")}`
        : components.length ? `Affected components and their integration checks: ${components.join(", ")}`
          : "Only display text, generated cache keys, documentation or registered static checks changed.",
      files: changes.map(({ path }) => path),
      changes,
    };
  } catch (error) {
    return { mode: "full", staticScope: "static", components: [], matrix: browserMatrix("full"), reason: `Cannot prove a narrower scope: ${error.message}`, files: [] };
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = { projectRoot: resolve(dirname(fileURLToPath(import.meta.url)), "..") };
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index].slice(2);
    if (!["base", "target"].includes(key) || !args[index + 1]) throw new Error("Usage: release-scope.mjs [--base ref] [--target ref]");
    options[key] = args[index + 1];
  }
  const plan = planRelease(options);
  console.log(JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `mode=${plan.mode}\nstatic-scope=${plan.staticScope}\nmatrix=${JSON.stringify(plan.matrix)}\npoint-addresses=${JSON.stringify(plan.pointAddresses || [])}\n`);
}
