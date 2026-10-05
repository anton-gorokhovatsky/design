import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const reelFrame = Object.freeze({ width: 900, height: 600 });
export const reelChapterFrame = Object.freeze({ width: 450, height: 300 });
export const reelSourceViewport = Object.freeze({ width: 1200, height: 800 });
const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));
const positive = value => Number.isFinite(value) && value > 0;

// The spec is data, including capture instructions. Reject unknown fields and
// unsafe output names before invoking FFmpeg or selecting the media CI lane.
export function validateReelSpecs(specs) {
  assert.ok(Array.isArray(specs) && specs.length > 0);
  const ids = new Set(), files = new Set();
  for (const spec of specs) {
    assert.ok(keys(spec, ["itemId", "master", "chapters", "posterAt", "duration", "capture"]));
    assert.match(spec.itemId, /^[a-z0-9-]+$/);
    assert.match(spec.master, /^[a-z0-9-]+\.mp4$/);
    assert.ok(!ids.has(spec.itemId) && !files.has(spec.master));
    ids.add(spec.itemId); files.add(spec.master);
    assert.ok(keys(spec.duration, ["target", "min", "max"]));
    const { target, min, max } = spec.duration;
    assert.ok([min, target, max].every(Number.isFinite) && positive(min) && min <= target && target <= max && max <= 120);
    assert.ok(Number.isFinite(spec.posterAt) && spec.posterAt >= 0 && spec.posterAt < min);
    assert.ok(Array.isArray(spec.chapters) && spec.chapters.length === 2);
    for (const chapter of spec.chapters) {
      assert.ok(keys(chapter, ["label", "start", "duration"]));
      assert.match(chapter.label, /^[a-z0-9-]+$/);
      assert.ok(Number.isFinite(chapter.start) && chapter.start >= 0 && positive(chapter.duration)
        && chapter.start + chapter.duration <= max);
    }
    const capture = spec.capture;
    assert.ok(keys(capture, ["url", "browser", "dismissSelectors", "finalHold", "scenes"]));
    assert.equal(new URL(capture.url).protocol, "https:");
    if (capture.browser !== undefined) assert.ok(["chrome", "chromium"].includes(capture.browser));
    if (capture.dismissSelectors !== undefined) assert.ok(Array.isArray(capture.dismissSelectors)
      && capture.dismissSelectors.every(value => typeof value === "string" && value.length > 0));
    if (capture.finalHold !== undefined) assert.ok(positive(capture.finalHold));
    if (capture.scenes !== undefined) {
      assert.ok(Array.isArray(capture.scenes) && capture.scenes.length > 0);
      const sceneIds = new Set();
      for (const scene of capture.scenes) {
        assert.ok(keys(scene, ["id", "url", "menu", "carouselAt", "duration", "scrollBy", "scrollStart", "hold", "scroll", "startHeading", "endHeading", "offset"]));
        assert.match(scene.id, /^[a-z0-9-]+$/);
        assert.ok(!sceneIds.has(scene.id)); sceneIds.add(scene.id);
        assert.ok(typeof scene.url === "string" && /^\/(?!\/)/.test(scene.url));
        assert.ok(positive(scene.duration));
        for (const key of ["carouselAt", "scrollBy", "scrollStart", "hold", "scroll", "offset"]) {
          if (scene[key] !== undefined) assert.ok(Number.isFinite(scene[key]));
        }
        for (const key of ["startHeading", "endHeading"]) {
          if (scene[key] !== undefined) assert.equal(typeof scene[key], "string");
        }
        if (scene.menu !== undefined) assert.equal(typeof scene.menu, "boolean");
      }
      const total = capture.scenes.reduce((sum, scene) => sum + scene.duration, 0);
      assert.ok(Math.abs(total - target) < .001, "Scene durations must add up to the master duration");
    }
  }
  return specs;
}
export const reelSpecs = validateReelSpecs(JSON.parse(readFileSync(new URL("./reel-specs.json", import.meta.url), "utf8")));
export const getReelChapterFileName = (spec, index) => `${spec.master.slice(0, -4)}-${String(index + 1).padStart(2, "0")}.mp4`;
