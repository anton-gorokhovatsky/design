import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelsDirectory = join(projectRoot, "assets", "reels");
const postersDirectory = join(projectRoot, "assets", "reel-posters");
const reelNames = readdirSync(reelsDirectory)
  .filter((name) => name.endsWith(".mp4"))
  .sort();
const failures = [];
const landscapeReels = [
  "11111.mp4",
  "doronin.mp4",
  "dusty-camp.mp4",
  "dusty-merch.mp4",
  "garage-collection.mp4",
  "garage-courses.mp4",
  "garage-site.mp4",
  "garage-webzine.mp4",
  "herman.mp4",
  "ks-fish.mp4",
  "narkomfin.mp4",
  "shirokostup.mp4",
  "tarski.mp4",
];
const reelSpecs = new Map(
  landscapeReels.map((name) => [
    name,
    {
      width: 900,
      height: 600,
      displayAspect: "3:2",
      sourceViewport: "1200x800",
    },
  ]),
);
reelSpecs.get("11111.mp4").sourceViewport = "1350x900";

const expectedReelNames = [...reelSpecs.keys()].sort();
const posterNames = readdirSync(postersDirectory)
  .filter((name) => name.endsWith(".jpg"))
  .sort();
const expectedPosterNames = expectedReelNames.map((name) => (
  name.replace(/\.mp4$/i, ".jpg")
));

if (JSON.stringify(reelNames) !== JSON.stringify(expectedReelNames)) {
  failures.push(
    `master set: expected ${expectedReelNames.join(", ")}; found ${reelNames.join(", ")}`,
  );
}

if (JSON.stringify(posterNames) !== JSON.stringify(expectedPosterNames)) {
  failures.push(
    `posters: expected ${expectedPosterNames.join(", ")}; found ${posterNames.join(", ")}`,
  );
}

for (const posterName of posterNames) {
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
          "stream=width,height",
          "-of",
          "json",
          join(postersDirectory, posterName),
        ],
        { encoding: "utf8" },
      ),
    );
    const metadata = probe.streams?.[0];

    if (metadata?.width !== 900 || metadata?.height !== 600) {
      failures.push(`${posterName}: poster must be 900×600`);
    }
  } catch {
    failures.push(`${posterName}: ffprobe could not read the poster`);
  }
}

for (const reelName of reelNames) {
  const reelPath = join(reelsDirectory, reelName);
  const spec = reelSpecs.get(reelName);
  let metadata;
  let formatMetadata;

  if (!spec) {
    continue;
  }

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

  if (metadata.width !== spec.width || metadata.height !== spec.height) {
    failures.push(
      `${reelName}: coded size must be ${spec.width}×${spec.height}`,
    );
  }

  if (metadata.sample_aspect_ratio !== "1:1") {
    failures.push(`${reelName}: pixels must be square (SAR 1:1)`);
  }

  if (metadata.display_aspect_ratio !== spec.displayAspect) {
    failures.push(
      `${reelName}: display aspect ratio must be ${spec.displayAspect}`,
    );
  }

  if (!Number.isFinite(duration) || duration < 7.5 || duration > 8.1) {
    failures.push(`${reelName}: duration must stay between 7.5 and 8.1 seconds`);
  }

  const fitComment = formatMetadata?.tags?.comment ?? "";

  if (
    !fitComment.includes("source-fit=native-capture")
    || !fitComment.includes(`source-viewport=${spec.sourceViewport}`)
    || !fitComment.includes(`source-dar=${spec.displayAspect}`)
  ) {
    failures.push(
      `${reelName}: metadata must identify its native capture geometry`,
    );
  }
}

const styles = readFileSync(join(projectRoot, "styles.css"), "utf8");
const scriptSource = readFileSync(join(projectRoot, "script.js"), "utf8");
const landscapeConfigurationCount = (
  scriptSource.match(/previewOrientation:\s*"landscape"/g) ?? []
).length;
const landscapeReferenceCount = (
  scriptSource.match(
    /previewVideo:\s*"assets\/reels\/[^"]+\.mp4\?v=20260728-landscape-reels-1"/g,
  ) ?? []
).length;
const videoRules = [
  ...styles.matchAll(/(?:\.map-hover-preview(?:\.has-video)?\s+)?\.map-hover-preview__media video\s*\{([^}]*)\}/g),
].map((match) => match[1]).join("\n");
const finalViewerMarker = "/* A reel is a source-faithful window";
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

if (landscapeConfigurationCount !== expectedReelNames.length) {
  failures.push(
    `configuration: expected ${expectedReelNames.length} landscape receivers; found ${landscapeConfigurationCount}`,
  );
}

if (landscapeReferenceCount !== expectedReelNames.length) {
  failures.push(
    `configuration: expected ${expectedReelNames.length} current landscape reel references; found ${landscapeReferenceCount}`,
  );
}

if (
  !/overflow:\s*hidden/.test(viewerRule)
  || !/border-radius:\s*clamp/.test(viewerRule)
  || !/background:\s*var\(--material-01\)/.test(viewerRule)
  || !/aspect-ratio:\s*4\s*\/\s*5/.test(viewerRule)
  || !/border:\s*0/.test(viewerRule)
  || !/box-shadow:\s*none/.test(viewerRule)
) {
  failures.push(
    "receiver: the default 4:5 viewer must use the rounded MATERIAL / 01 silhouette without border or shadow",
  );
}

if (!/aspect-ratio:\s*3\s*\/\s*2/.test(landscapeViewerRule)) {
  failures.push("receiver: desktop-site reels must remain horizontal 3:2");
}

if (
  !/overflow:\s*hidden/.test(mediaRule)
  || !/border-radius:\s*inherit/.test(mediaRule)
) {
  failures.push("receiver: the media wrapper must inherit the stable silhouette");
}

if (!/border-radius:\s*0/.test(finalVideoRule)) {
  failures.push("receiver: the video itself must not receive a clipping radius");
}

if (failures.length) {
  console.error(`Reel check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Reel check passed: ${reelNames.length} native desktop captures and ${posterNames.length} selected 3:2 posters.`,
);
