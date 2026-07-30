#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(scriptDirectory, "..");
const indexPath = "index.html";
const stylesheetPath = "styles.css";
const hashLength = 12;
const importMapStart = "    <!-- runtime-import-map:start -->";
const importMapEnd = "    <!-- runtime-import-map:end -->";

export const cacheVersionFiles = [
  stylesheetPath,
  ...runtimeFiles,
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hashFile = (projectRoot, path) => createHash("sha256")
  .update(readFileSync(resolve(projectRoot, path)))
  .digest("hex")
  .slice(0, hashLength);

export const getCacheVersions = (projectRoot = defaultProjectRoot) => new Map(
  cacheVersionFiles.map((path) => [path, hashFile(projectRoot, path)]),
);

const renderImportMap = (versions) => {
  const imports = Object.fromEntries(runtimeFiles.map((path) => [
    `./${path}`,
    `./${path}?v=${versions.get(path)}`,
  ]));
  const json = JSON.stringify({ imports }, null, 2)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");

  return [
    importMapStart,
    "    <script type=\"importmap\" data-runtime-import-map>",
    json,
    "    </script>",
    importMapEnd,
  ].join("\n");
};

const replaceVersionedAttribute = (
  source,
  {
    attribute,
    path,
    version,
  },
) => {
  const pattern = new RegExp(
    `(${attribute}=["']${escapeRegExp(path)})(?:\\?v=[^"']*)?(["'])`,
    "g",
  );
  let replacements = 0;
  const nextSource = source.replace(pattern, (_, prefix, suffix) => {
    replacements += 1;
    return `${prefix}?v=${version}${suffix}`;
  });

  if (replacements !== 1) {
    throw new Error(
      `Expected one ${attribute} reference for ${path}, found ${replacements}.`,
    );
  }

  return nextSource;
};

export const buildVersionedIndexSource = (source, versions) => {
  let nextSource = replaceVersionedAttribute(source, {
    attribute: "href",
    path: stylesheetPath,
    version: versions.get(stylesheetPath),
  });

  for (const path of runtimeFiles) {
    nextSource = replaceVersionedAttribute(nextSource, {
      attribute: "src",
      path,
      version: versions.get(path),
    });
  }

  const importMapPattern = new RegExp(
    `${escapeRegExp(importMapStart)}[\\s\\S]*?${escapeRegExp(importMapEnd)}`,
  );

  if (!importMapPattern.test(nextSource)) {
    throw new Error("index.html is missing the managed runtime import-map block.");
  }

  return nextSource.replace(importMapPattern, renderImportMap(versions));
};

export const syncRuntimeAssetVersions = (
  projectRoot = defaultProjectRoot,
) => {
  const absoluteIndexPath = resolve(projectRoot, indexPath);
  const source = readFileSync(absoluteIndexPath, "utf8");
  const versions = getCacheVersions(projectRoot);
  const nextSource = buildVersionedIndexSource(source, versions);
  const changed = source !== nextSource;

  if (changed) {
    writeFileSync(absoluteIndexPath, nextSource);
  }

  return {
    changed,
    indexPath,
    versions,
  };
};

export const verifyRuntimeAssetVersions = (
  projectRoot = defaultProjectRoot,
) => {
  const source = readFileSync(resolve(projectRoot, indexPath), "utf8");
  const versions = getCacheVersions(projectRoot);
  const expectedSource = buildVersionedIndexSource(source, versions);

  if (source !== expectedSource) {
    throw new Error(
      "index.html has stale CSS/JS content hashes; run `pnpm cache` "
      + "or let the release command update them.",
    );
  }

  return {
    indexPath,
    versions,
  };
};

const isCommandLine = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCommandLine) {
  const mode = process.argv[2] || "--check";

  try {
    if (mode === "--write") {
      const result = syncRuntimeAssetVersions();
      console.log(
        result.changed
          ? `Updated ${result.indexPath} with ${result.versions.size} content hashes.`
          : `${result.indexPath} already has current content hashes.`,
      );
    } else if (mode === "--check") {
      const result = verifyRuntimeAssetVersions();
      console.log(
        `Cache versions are current for ${result.versions.size} runtime assets.`,
      );
    } else {
      throw new Error(`Unknown mode "${mode}". Use --check or --write.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
