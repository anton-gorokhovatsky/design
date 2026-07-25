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
const naturalAspectReels = new Set([
  "garage-collection.mp4",
  "garage-site.mp4",
  "herman.mp4",
  "ks-fish.mp4",
  "narkomfin.mp4",
  "tarski.mp4",
]);

for (const reelName of reelNames) {
  const reelPath = join(reelsDirectory, reelName);
  let metadata;
  let formatMetadata;

  try {
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,sample_aspect_ratio,display_aspect_ratio,duration:format_tags=comment",
          "-of",
          "json",
          reelPath,
        ],
        { encoding: "utf8" },
      ),
    );
    metadata = probe.streams?.[0];
    formatMetadata = probe.format;
  } catch {
    failures.push(`${reelName}: ffprobe could not read the video`);
    continue;
  }

  if (!metadata) {
    failures.push(`${reelName}: no video stream`);
    continue;
  }

  const duration = Number(metadata.duration);

  const usesNaturalAspect = naturalAspectReels.has(reelName);
  const expectedHeight = usesNaturalAspect ? 578 : 750;
  const expectedDisplayAspect = usesNaturalAspect ? "300:289" : "4:5";

  if (metadata.width !== 600 || metadata.height !== expectedHeight) {
    failures.push(`${reelName}: coded size must be 600×${expectedHeight}`);
  }

  if (metadata.sample_aspect_ratio !== "1:1") {
    failures.push(`${reelName}: pixels must be square (SAR 1:1)`);
  }

  if (metadata.display_aspect_ratio !== expectedDisplayAspect) {
    failures.push(
      `${reelName}: display aspect ratio must be ${expectedDisplayAspect}`,
    );
  }

  if (!Number.isFinite(duration) || duration < 6.75 || duration > 10.25) {
    failures.push(`${reelName}: duration must stay between 7 and 10 seconds`);
  }

  if (usesNaturalAspect) {
    const fitComment = formatMetadata?.tags?.comment ?? "";

    if (
      !fitComment.includes("source-fit=natural")
      || !fitComment.includes("source-dar=640:617")
    ) {
      failures.push(
        `${reelName}: source display geometry must be resampled at its natural aspect`,
      );
    }
  }
}

const styles = readFileSync(join(projectRoot, "styles.css"), "utf8");
const videoRules = [
  ...styles.matchAll(/(?:\.map-hover-preview(?:\.has-video)?\s+)?\.map-hover-preview__media video\s*\{([^}]*)\}/g),
].map((match) => match[1]).join("\n");
const finalViewerMarker = "/* A reel is the media shape itself";
const finalViewerSource = styles.slice(styles.lastIndexOf(finalViewerMarker));
const viewerRule = finalViewerSource.match(/\.map-hover-preview\.has-video\s*\{([^}]*)\}/)?.[1] ?? "";
const landscapeViewerRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video\.is-landscape\s*\{([^}]*)\}/,
)?.[1] ?? "";
const mediaRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video\s+\.map-hover-preview__media\s*\{([^}]*)\}/,
)?.[1] ?? "";
const finalVideoRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video\s+\.map-hover-preview__media video\s*\{([^}]*)\}/,
)?.[1] ?? "";

if (!/object-fit:\s*contain/.test(videoRules)) {
  failures.push("receiver: site reels must use object-fit: contain");
}

if (!/object-position:\s*center top/.test(videoRules)) {
  failures.push("receiver: site reels must remain top-aligned");
}

if (
  !/overflow:\s*visible/.test(viewerRule)
  || !/border-radius:\s*0/.test(viewerRule)
  || !/background:\s*var\(--material-01\)/.test(viewerRule)
  || !/aspect-ratio:\s*4\s*\/\s*5/.test(viewerRule)
) {
  failures.push("receiver: the default 4:5 viewer must use MATERIAL / 01 without clipping");
}

if (!/aspect-ratio:\s*5\s*\/\s*4/.test(landscapeViewerRule)) {
  failures.push("receiver: the House of Narkomfin exception must remain horizontal 5:4");
}

if (
  !/overflow:\s*visible/.test(mediaRule)
  || !/border-radius:\s*0/.test(mediaRule)
) {
  failures.push("receiver: the reel media wrapper must not crop rounded corners");
}

if (!/border-radius:\s*0/.test(finalVideoRule)) {
  failures.push("receiver: the video itself must not receive a clipping radius");
}

if (failures.length) {
  console.error(`Reel check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Reel check passed: ${reelNames.length} files, square pixels, source-faithful contain, 4:5 material receiver, 5:4 Narkomfin exception.`,
);
