import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getReelChapterFileName,
  reelChapterFrame,
  reelChapterSpecs,
} from "./reel-chapter-specs.mjs";
import { readRuntimeSource } from "./runtime-files.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelsDirectory = join(projectRoot, "assets", "reels");
const postersDirectory = join(projectRoot, "assets", "reel-posters");
const chaptersDirectory = join(projectRoot, "assets", "reel-chapters");
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
  "hotline-camp.mp4",
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
      duration: { min: 7.5, max: 8.1 },
    },
  ]),
);
reelSpecs.get("11111.mp4").duration = { min: 11.5, max: 12.1 };
reelSpecs.get("garage-webzine.mp4").duration = { min: 12.1, max: 12.7 };
reelSpecs.get("herman.mp4").duration = { min: 14.5, max: 15.1 };
reelSpecs.get("hotline-camp.mp4").duration = { min: 13.7, max: 14.1 };
reelSpecs.get("narkomfin.mp4").duration = { min: 12.9, max: 13.5 };
reelSpecs.get("shirokostup.mp4").duration = { min: 12.5, max: 13.1 };
reelSpecs.get("tarski.mp4").duration = { min: 12.1, max: 12.7 };

const expectedReelNames = [...reelSpecs.keys()].sort();
const posterNames = readdirSync(postersDirectory)
  .filter((name) => name.endsWith(".jpg"))
  .sort();
const expectedPosterNames = expectedReelNames.map((name) => (
  name.replace(/\.mp4$/i, ".jpg")
));
const chapterNames = readdirSync(chaptersDirectory)
  .filter((name) => name.endsWith(".mp4"))
  .sort();
const chapterSpecsByName = new Map(reelChapterSpecs.flatMap((spec) => (
  spec.chapters.map((chapter, chapterIndex) => [
    getReelChapterFileName(spec, chapterIndex),
    { chapter, spec },
  ])
)));
const expectedChapterNames = [...chapterSpecsByName.keys()].sort();

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

if (JSON.stringify(chapterNames) !== JSON.stringify(expectedChapterNames)) {
  failures.push(
    `chapters: expected ${expectedChapterNames.join(", ")}; found ${chapterNames.join(", ")}`,
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

  if (
    !Number.isFinite(duration)
    || duration < spec.duration.min
    || duration > spec.duration.max
  ) {
    failures.push(
      `${reelName}: duration must stay between ${spec.duration.min} `
        + `and ${spec.duration.max} seconds`,
    );
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

for (const chapterName of chapterNames) {
  const chapterPath = join(chaptersDirectory, chapterName);
  const expected = chapterSpecsByName.get(chapterName);
  let metadata;
  let formatMetadata;

  if (!expected) {
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
          "stream=codec_name,pix_fmt,width,height,sample_aspect_ratio,display_aspect_ratio,duration:format_tags=comment",
          "-of",
          "json",
          chapterPath,
        ],
        { encoding: "utf8" },
      ),
    );
    metadata = probe.streams?.[0];
    formatMetadata = probe.format;
  } catch {
    failures.push(`${chapterName}: ffprobe could not read the chapter`);
    continue;
  }

  if (!metadata) {
    failures.push(`${chapterName}: no video stream`);
    continue;
  }

  const duration = Number(metadata.duration);
  const expectedEnd = expected.chapter.start + expected.chapter.duration;
  const fitComment = formatMetadata?.tags?.comment ?? "";

  if (
    metadata.width !== reelChapterFrame.width
    || metadata.height !== reelChapterFrame.height
  ) {
    failures.push(
      `${chapterName}: coded size must be ${reelChapterFrame.width}×${reelChapterFrame.height}`,
    );
  }

  if (
    metadata.sample_aspect_ratio !== "1:1"
    || metadata.display_aspect_ratio !== "3:2"
  ) {
    failures.push(`${chapterName}: chapter geometry must remain square-pixel 3:2`);
  }

  if (
    metadata.codec_name !== "h264"
    || !["yuv420p", "yuvj420p"].includes(metadata.pix_fmt)
  ) {
    failures.push(`${chapterName}: chapter must remain H.264 4:2:0`);
  }

  if (
    !Number.isFinite(duration)
    || Math.abs(duration - expected.chapter.duration) > 0.12
  ) {
    failures.push(
      `${chapterName}: duration must stay near ${expected.chapter.duration.toFixed(1)} seconds`,
    );
  }

  if (
    !fitComment.includes("source-fit=native-chapter")
    || !fitComment.includes(`source-master=${expected.spec.master}`)
    || !fitComment.includes(
      `source-range=${expected.chapter.start.toFixed(1)}-${expectedEnd.toFixed(1)}`,
    )
    || !fitComment.includes("source-dar=3:2")
  ) {
    failures.push(`${chapterName}: metadata must identify its curated master range`);
  }
}

const styles = readFileSync(join(projectRoot, "styles.css"), "utf8");
const scriptSource = readRuntimeSource(projectRoot);
const landscapeConfigurationCount = (
  scriptSource.match(/previewOrientation:\s*"landscape"/g) ?? []
).length;
const landscapeReferences = [
  ...scriptSource.matchAll(
    /previewVideo:\s*"assets\/reels\/([^"]+\.mp4)\?v=([a-f0-9]{12})"/g,
  ),
].map((match) => ({
  name: match[1],
  version: match[2],
}));
const chapterReferences = [
  ...scriptSource.matchAll(
    /assets\/reel-chapters\/([^"?]+\.mp4)\?v=([a-f0-9]{12})/g,
  ),
].map((match) => ({
  name: match[1],
  version: match[2],
}));
const chapterReferenceNames = chapterReferences
  .map(({ name }) => name)
  .sort();
const landscapeReferenceNames = landscapeReferences
  .map(({ name }) => name)
  .sort();
const videoRules = [
  ...styles.matchAll(/(?:\.map-hover-preview(?:\.has-video)?\s+)?\.map-hover-preview__media video\s*\{([^}]*)\}/g),
].map((match) => match[1]).join("\n");
const finalViewerMarker = "/* Reels remain unframed content.";
const finalViewerSource = styles.slice(styles.lastIndexOf(finalViewerMarker));
const viewerRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video,\s*\.map-hover-preview\.has-video\.is-landscape\s*\{([^}]*)\}/,
)?.[1] ?? "";
const mediaRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video\s+\.map-hover-preview__media\s*\{([^}]*)\}/,
)?.[1] ?? "";
const landscapeMediaRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video\.is-landscape\s+\.map-hover-preview__media\s*\{([^}]*)\}/,
)?.[1] ?? "";
const finalVideoRule = finalViewerSource.match(
  /\.map-hover-preview\.has-video\s+\.map-hover-preview__media video\s*\{([^}]*)\}/,
)?.[1] ?? "";

if (
  !scriptSource.includes('const reelMosaicEnabled = reelMosaicMode !== "single";')
  || !scriptSource.includes('mapPreview.dataset.reelLayout = "mosaic";')
) {
  failures.push(
    "receiver: the reel mosaic must be the default desktop layout with an explicit single-reel fallback",
  );
}
const mosaicMainRule = styles.match(
  /> \.map-hover-preview__mosaic-main\s*\{([^}]*)\}/,
)?.[1] ?? "";
const mosaicSlotRule = styles.match(
  /\.map-hover-preview__mosaic-slot\s*\{([^}]*)\}/,
)?.[1] ?? "";
const mosaicVideoRule = styles.match(
  /\.map-hover-preview\.has-video\.has-reel-mosaic\s+\.map-hover-preview__mosaic-video\s*\{([^}]*)\}/,
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

if (
  landscapeReferences.length !== expectedReelNames.length
  || JSON.stringify(landscapeReferenceNames) !== JSON.stringify(expectedReelNames)
) {
  failures.push(
    `configuration: expected ${expectedReelNames.length} content-versioned `
      + `landscape reel references; found ${landscapeReferences.length}`,
  );
}

for (const reference of landscapeReferences) {
  const expectedVersion = createHash("sha256")
    .update(readFileSync(join(reelsDirectory, reference.name)))
    .digest("hex")
    .slice(0, 12);

  if (reference.version !== expectedVersion) {
    failures.push(
      `${reference.name}: cache key ${reference.version} does not match `
        + `content hash ${expectedVersion}`,
    );
  }
}

if (
  chapterReferences.length !== expectedChapterNames.length
  || JSON.stringify(chapterReferenceNames) !== JSON.stringify(expectedChapterNames)
) {
  failures.push(
    `configuration: expected ${expectedChapterNames.length} content-versioned `
      + `reel chapter references; found ${chapterReferences.length}`,
  );
}

for (const reference of chapterReferences) {
  const expectedVersion = createHash("sha256")
    .update(readFileSync(join(chaptersDirectory, reference.name)))
    .digest("hex")
    .slice(0, 12);

  if (reference.version !== expectedVersion) {
    failures.push(
      `${reference.name}: cache key ${reference.version} does not match `
        + `content hash ${expectedVersion}`,
    );
  }
}

if (
  !/display:\s*grid/.test(viewerRule)
  || !/overflow:\s*visible/.test(viewerRule)
  || !/border-radius:\s*0/.test(viewerRule)
  || !/background:\s*transparent/.test(viewerRule)
  || !/backdrop-filter:\s*none/.test(viewerRule)
) {
  failures.push(
    "receiver: the outer viewer must remain an unframed content group",
  );
}

if (!/aspect-ratio:\s*3\s*\/\s*2/.test(landscapeMediaRule)) {
  failures.push("receiver: desktop-site reels must remain horizontal 3:2");
}

if (
  !/overflow:\s*hidden/.test(mediaRule)
  || !/border-radius:\s*clamp/.test(mediaRule)
  || !/box-shadow:\s*none/.test(mediaRule)
) {
  failures.push("receiver: the media wrapper must own the stable clipping silhouette");
}

if (
  !/object-fit:\s*contain/.test(finalVideoRule)
  || !/object-position:\s*center top/.test(finalVideoRule)
  || !/border-radius:\s*0/.test(videoRules)
) {
  failures.push("receiver: the video itself must not receive a clipping radius");
}

if (
  !/position:\s*absolute/.test(mosaicMainRule)
  || !/overflow:\s*hidden/.test(mosaicMainRule)
  || !/aspect-ratio:\s*3\s*\/\s*2/.test(mosaicMainRule)
  || !/border-radius:\s*clamp/.test(mosaicMainRule)
  || !/overflow:\s*hidden/.test(mosaicSlotRule)
  || !/aspect-ratio:\s*3\s*\/\s*2/.test(mosaicSlotRule)
  || !/border-radius:\s*clamp/.test(mosaicSlotRule)
  || !/object-fit:\s*contain/.test(mosaicVideoRule)
  || !/object-position:\s*center top/.test(mosaicVideoRule)
  || !/border-radius:\s*0/.test(mosaicVideoRule)
) {
  failures.push(
    "receiver: mosaic wrappers must own 3:2 clipping while videos remain source-faithful",
  );
}

if (failures.length) {
  console.error(`Reel check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Reel check passed: ${reelNames.length} native desktop captures, `
    + `${posterNames.length} selected 3:2 posters, and `
    + `${chapterNames.length} curated reel chapters.`,
);
