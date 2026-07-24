import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelsDirectory = join(projectRoot, "assets", "reels");
const reelNames = readdirSync(reelsDirectory)
  .filter((name) => name.endsWith(".mp4"))
  .sort();
const failures = [];

for (const reelName of reelNames) {
  const reelPath = join(reelsDirectory, reelName);
  let metadata;

  try {
    metadata = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,sample_aspect_ratio,display_aspect_ratio,duration",
          "-of",
          "json",
          reelPath,
        ],
        { encoding: "utf8" },
      ),
    ).streams?.[0];
  } catch {
    failures.push(`${reelName}: ffprobe could not read the video`);
    continue;
  }

  if (!metadata) {
    failures.push(`${reelName}: no video stream`);
    continue;
  }

  const duration = Number(metadata.duration);

  if (metadata.width !== 600 || metadata.height !== 750) {
    failures.push(`${reelName}: coded size must be 600×750`);
  }

  if (metadata.sample_aspect_ratio !== "1:1") {
    failures.push(`${reelName}: pixels must be square (SAR 1:1)`);
  }

  if (metadata.display_aspect_ratio !== "4:5") {
    failures.push(`${reelName}: display aspect ratio must be 4:5`);
  }

  if (!Number.isFinite(duration) || duration < 6.75 || duration > 10.25) {
    failures.push(`${reelName}: duration must stay between 7 and 10 seconds`);
  }
}

const styles = readFileSync(join(projectRoot, "styles.css"), "utf8");
const videoRule = styles.match(/\.map-hover-preview__media video\s*\{([^}]*)\}/)?.[1] ?? "";

if (!/object-fit:\s*contain/.test(videoRule)) {
  failures.push("receiver: site reels must use object-fit: contain");
}

if (!/object-position:\s*center top/.test(videoRule)) {
  failures.push("receiver: site reels must remain top-aligned");
}

if (failures.length) {
  console.error(`Reel check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Reel check passed: ${reelNames.length} files, 600×750, square pixels, 4:5, full-width contain.`,
);
