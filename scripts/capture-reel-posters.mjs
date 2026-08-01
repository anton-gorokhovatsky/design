import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelsDirectory = join(projectRoot, "assets", "reels");
const postersDirectory = join(projectRoot, "assets", "reel-posters");
const selectedFrames = new Map([
  ["11111", 0.75],
  ["doronin", 1.35],
  ["dusty-camp", 1.45],
  ["dusty-merch", 1.35],
  ["garage-collection", 1.55],
  ["garage-courses", 1.45],
  ["garage-site", 1.35],
  ["garage-webzine", 1.45],
  ["herman", 1.35],
  ["ks-fish", 1.45],
  ["narkomfin", 4.9],
  ["shirokostup", 1.35],
  ["tarski", 1.45],
]);

mkdirSync(postersDirectory, { recursive: true });

const reelPaths = readdirSync(reelsDirectory)
  .filter((name) => name.endsWith(".mp4"))
  .sort()
  .filter((name) => (
    process.argv.length <= 2
    || process.argv.slice(2).includes(basename(name, ".mp4"))
  ))
  .map((name) => join(reelsDirectory, name));

if (reelPaths.length === 0) {
  throw new Error(
    `No matching reels for: ${process.argv.slice(2).join(", ") || "(none)"}`,
  );
}

for (const reelPath of reelPaths) {
  const id = basename(reelPath, ".mp4");
  const timestamp = selectedFrames.get(id) ?? 1.4;
  const outputPath = join(postersDirectory, `${id}.jpg`);

  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(timestamp),
      "-i",
      reelPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=900:600:flags=lanczos",
      "-q:v",
      "3",
      outputPath,
    ],
    { stdio: "inherit" },
  );

  console.log(`${id}: ${timestamp.toFixed(2)}s`);
}

console.log(`Created ${reelPaths.length} poster(s) in ${postersDirectory}`);
