#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJs } from "acorn";
import { parse as parseHtml } from "parse5";
import { cacheVersionFiles } from "./cache-versions.mjs";

// Only display fields in these data arrays are copy. Selectors, destinations,
// identifiers, search rules, expressions and every other byte remain protected.
const copyArrays = {
  "js/panels.js": { name: "commandViews", fields: ["title", "meta"] },
  "js/map-data.js": {
    name: "mapItems", fields: ["label", "title", "meta", "description", "timeLabel", "kindLabel"],
  },
  "js/observation-route.js": {
    name: "observationSteps", fields: ["title", "meta", "description"],
  },
};
const evidenceFields = new Set(["task", "role", "result", "feature"]);
const keyOf = (property) => !property.computed && (property.key?.name ?? property.key?.value);
const isString = (node) => node?.type === "Literal" && typeof node.value === "string";
const maskRanges = (source, ranges) => ranges
  .sort((a, b) => b[0] - a[0])
  .reduce((text, [start, end]) => text.slice(0, start) + "__COPY__" + text.slice(end), source);
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

const maskHtmlCopy = (source) => {
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
      return;
    }
    if (["style", "template", "noscript"].includes(node.tagName)) return;
    if (node.nodeName === "#text" && location && node.value.trim()) {
      ranges.push([location.startOffset, location.endOffset]);
    }
    for (const name of ["aria-label", "title", "alt", "placeholder"]) {
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
    masked = masked.replace(new RegExp(`(["'](?:\\./)?${escaped}\\?v=)[a-f0-9]{12}(?=["'])`, "g"), "$1__HASH__");
  }
  return masked;
};

export const isCopyOnly = (path, before, after) => {
  if (before === after) return true;
  if (path === "README.md" || /^docs\/[^\n]+\.md$/.test(path)) return true;
  try {
    if (copyArrays[path]) return maskJavaScriptCopy(path, before) === maskJavaScriptCopy(path, after);
    if (path === "index.html") return maskHtmlCopy(before) === maskHtmlCopy(after);
  } catch {
    // Syntax errors and unrecognised forms never opt out of full checks.
  }
  return false;
};

export const planRelease = ({ projectRoot, base = "origin/gh-pages", target } = {}) => {
  const git = (...args) => execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    const baseSha = git("rev-parse", "--verify", `${base}^{commit}`).trim();
    const targetSha = target ? git("rev-parse", "--verify", `${target}^{commit}`).trim() : null;
    // Compare everything not yet published, not merely HEAD^ or the last push.
    const entries = git("diff", "--name-status", "--no-renames", "-z", baseSha, ...(targetSha ? [targetSha] : []), "--")
      .split("\0").filter(Boolean);
    const changes = [];
    for (let index = 0; index < entries.length; index += 2) {
      const [status, path] = entries.slice(index, index + 2);
      let copy = false;
      if (status === "M" && (copyArrays[path] || path === "index.html" || path === "README.md" || /^docs\/.*\.md$/.test(path))) {
        const before = git("show", `${baseSha}:${path}`);
        const after = targetSha ? git("show", `${targetSha}:${path}`) : readFileSync(resolve(projectRoot, path), "utf8");
        copy = isCopyOnly(path, before, after);
      }
      changes.push({ path, copy });
    }
    if (!targetSha) {
      changes.push(...git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)
        .map((path) => ({ path, copy: false })));
    }
    const fullPaths = changes.filter(({ copy }) => !copy).map(({ path }) => path);
    return {
      mode: fullPaths.length ? "full" : "copy", base: baseSha,
      reason: fullPaths.length ? `Changes beyond copy: ${fullPaths.join(", ")}` : "Only display text, generated cache keys or documentation changed.",
      files: changes.map(({ path }) => path),
    };
  } catch (error) {
    return { mode: "full", reason: `Cannot prove copy-only scope: ${error.message}`, files: [] };
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
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\n`);
}
