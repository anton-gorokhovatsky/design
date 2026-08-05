#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  getReelChapterFileName,
  reelChapterFrame,
  reelChapterSpecs,
} from "./reel-chapter-specs.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelsDirectory = join(projectRoot, "assets", "reels");
const chaptersDirectory = join(projectRoot, "assets", "reel-chapters");
const mapDataPath = join(projectRoot, "js", "map-data.js");
const ffmpegPath = process.env.PORTFOLIO_FFMPEG || "ffmpeg";
const manifestStart = "// reel-chapter-manifest:start";
const manifestEnd = "// reel-chapter-manifest:end";
const selectedItemId = process.argv[2] || "";
const selectedSpecs = selectedItemId
  ? reelChapterSpecs.filter(({ itemId }) => itemId === selectedItemId)
  : reelChapterSpecs;

if (selectedItemId && selectedSpecs.length === 0) {
  console.error(`Unknown reel item "${selectedItemId}".`);
  process.exit(1);
}

mkdirSync(chaptersDirectory, { recursive: true });

for (const spec of selectedSpecs) {
  const masterPath = join(reelsDirectory, spec.master);

  if (!existsSync(masterPath)) {
    console.error(`Missing master reel ${spec.master}.`);
    process.exit(1);
  }

  spec.chapters.forEach((chapter, chapterIndex) => {
    const outputName = getReelChapterFileName(spec, chapterIndex);
    const outputPath = join(chaptersDirectory, outputName);
    const rangeEnd = chapter.start + chapter.duration;
    const comment = [
      "source-fit=native-chapter",
      `source-master=${spec.master}`,
      `source-range=${chapter.start.toFixed(1)}-${rangeEnd.toFixed(1)}`,
      "source-dar=3:2",
      `chapter=${chapter.label}`,
    ].join("; ");

    execFileSync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        masterPath,
        "-ss",
        String(chapter.start),
        "-t",
        String(chapter.duration),
        "-an",
        "-vf",
        `scale=${reelChapterFrame.width}:${reelChapterFrame.height}:flags=lanczos,setsar=1`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        "-metadata",
        `comment=${comment}`,
        outputPath,
      ],
      { stdio: "inherit" },
    );
  });
}

const hashFile = (path) => createHash("sha256")
  .update(readFileSync(path))
  .digest("hex")
  .slice(0, 12);

const manifestEntries = reelChapterSpecs.map((spec) => {
  const sources = spec.chapters.map((_, chapterIndex) => {
    const fileName = getReelChapterFileName(spec, chapterIndex);
    const absolutePath = join(chaptersDirectory, fileName);

    if (!existsSync(absolutePath)) {
      throw new Error(`Missing generated chapter ${fileName}.`);
    }

    return `      "assets/reel-chapters/${fileName}?v=${hashFile(absolutePath)}",`;
  });

  return [
    `  ["${spec.itemId}", [`,
    ...sources,
    "  ]],",
  ].join("\n");
});
const manifest = [
  manifestStart,
  "const reelChapterSources = new Map([",
  ...manifestEntries,
  "]);",
  manifestEnd,
].join("\n");
const mapDataSource = readFileSync(mapDataPath, "utf8");
const startIndex = mapDataSource.indexOf(manifestStart);
const endIndex = mapDataSource.indexOf(manifestEnd);

if (startIndex < 0 || endIndex < startIndex) {
  throw new Error("map-data.js is missing its managed reel chapter manifest.");
}

const nextMapDataSource = [
  mapDataSource.slice(0, startIndex),
  manifest,
  mapDataSource.slice(endIndex + manifestEnd.length),
].join("");

writeFileSync(mapDataPath, nextMapDataSource);

console.log(
  `Captured ${selectedSpecs.length * 2} reel chapters at `
    + `${reelChapterFrame.width}×${reelChapterFrame.height} and refreshed `
    + `${reelChapterSpecs.length * 2} content hashes.`,
);
