#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reelSpecs, reelFrame, reelChapterFrame, getReelChapterFileName } from "./reel-specs.mjs";
import { probeMaster, syncReelMetadata } from "./reel-metadata.mjs";
import { syncRuntimeAssetVersions, verifyRuntimeAssetVersions } from "./cache-versions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), flags = new Set(), ids = [];
let master;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--master") { assert.ok(args[i + 1] && !args[i + 1].startsWith("--")); master = resolve(args[++i]); }
  else if (["--check", "--sync", "--capture"].includes(args[i])) flags.add(args[i]);
  else { assert.ok(!args[i].startsWith("--"), `Unknown option ${args[i]}`); ids.push(args[i]); }
}
assert.ok(ids.length <= 1 && flags.size <= 1, "Use: pnpm media:prepare [item-id] [--capture | --master path | --sync | --check]");
assert.ok(!master || flags.size === 0, "--master cannot be combined with another mode");
const selected = ids.length ? reelSpecs.filter(spec => [spec.itemId, spec.master.slice(0, -4)].includes(ids[0])) : reelSpecs;
assert.ok(selected.length, `Unknown reel ${ids[0]}`);
assert.ok(!(master || flags.has("--capture")) || selected.length === 1, "A source master or capture requires one item ID");
const ffmpeg = (...args) => execFileSync(process.env.PORTFOLIO_FFMPEG || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

if (!flags.has("--check") && !flags.has("--sync")) {
  if (flags.has("--capture")) {
    const name = selected[0].master.slice(0, -4);
    execFileSync(process.execPath, ["scripts/capture-reels.cjs", name], { cwd: root, stdio: "inherit" });
    master = join(resolve(process.env.PORTFOLIO_REEL_OUTPUT || join(root, ".reel-capture")), "final", selected[0].master);
  }
  const stage = mkdtempSync(join(tmpdir(), "portfolio-reels-")), outputs = [];
  try {
    for (const spec of selected) {
      const input = master || join(root, "assets/reels", spec.master);
      probeMaster(input, spec);
      if (master) outputs.push([master, `assets/reels/${spec.master}`]);
      const poster = spec.master.slice(0, -4) + ".jpg", posterPath = join(stage, poster);
      ffmpeg("-ss", String(spec.posterAt), "-i", input, "-frames:v", "1", "-vf", `scale=${reelFrame.width}:${reelFrame.height}:flags=lanczos`, "-q:v", "3", posterPath);
      outputs.push([posterPath, `assets/reel-posters/${poster}`]);
      for (const [index, chapter] of spec.chapters.entries()) {
        const name = getReelChapterFileName(spec, index), path = join(stage, name);
        const comment = `source-fit=native-chapter; source-master=${spec.master}; source-range=${chapter.start.toFixed(1)}-${(chapter.start + chapter.duration).toFixed(1)}; source-dar=3:2; chapter=${chapter.label}`;
        ffmpeg("-i", input, "-ss", String(chapter.start), "-t", String(chapter.duration), "-an", "-vf",
          `scale=${reelChapterFrame.width}:${reelChapterFrame.height}:flags=lanczos,setsar=1`, "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", "-map_metadata", "-1", "-metadata", `comment=${comment}`, path);
        outputs.push([path, `assets/reel-chapters/${name}`]);
      }
    }
    // Encoding failures leave the published files untouched.
    for (const [input, relative] of outputs) {
      const output = join(root, relative); mkdirSync(dirname(output), { recursive: true });
      if (resolve(input) !== output) copyFileSync(input, output);
    }
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
syncReelMetadata(root, { check: flags.has("--check") });
if (flags.has("--check")) verifyRuntimeAssetVersions(root);
else syncRuntimeAssetVersions(root);
console.log(`${flags.has("--check") ? "Verified" : "Prepared"} media metadata for ${reelSpecs.length} masters, posters and ${reelSpecs.length * 2} chapters.`);
