import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const entropy = length => Buffer.concat(Array.from({ length: Math.ceil(length / 40) },
  (_, index) => createHash("sha256").update(String(index)).digest()))
  .toString("base64").slice(0, length);
const check = ({ html = "", css = "", runtime = "", font = 0, story = "" } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "portfolio-budget-"));
  try {
    for (const dir of ["scripts", "js", "assets"]) mkdirSync(join(root, dir));
    copyFileSync(new URL("./check-performance-budget.mjs", import.meta.url), join(root, "scripts/check-performance-budget.mjs"));
    writeFileSync(join(root, "scripts/runtime-files.mjs"), 'export const runtimeFiles=["js/test.js"];export const runtimeDataFiles=["js/test.json"];export const storyFiles=["assets/story.js"];');
    writeFileSync(join(root, "index.html"), '<link rel="preload" href="assets/test.woff2"><main>' + html + '</main>');
    writeFileSync(join(root, "styles.css"), css);
    writeFileSync(join(root, "assets/story.js"), story);
    writeFileSync(join(root, "js/test.js"), runtime);
    writeFileSync(join(root, "js/test.json"), "{}");
    writeFileSync(join(root, "assets/test.woff2"), Buffer.alloc(font));
    return spawnSync(process.execPath, [join(root, "scripts/check-performance-budget.mjs")], { encoding: "utf8" });
  } finally { rmSync(root, { recursive: true, force: true }); }
};

test("complete initial page includes HTML", () => {
  const result = check({ html: "a".repeat(70 * 1024) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /70\.1 KiB initial HTML\/CSS\/JS\/fonts/);
});
test("HTML source growth is bounded", () => {
  const result = check({ html: "a".repeat(77 * 1024) });
  assert.equal(result.status, 1); assert.match(result.stderr, /html: .* exceeds/);
});
test("HTML compressed growth is bounded independently", () => {
  const result = check({ html: entropy(43_000) });
  assert.equal(result.status, 1); assert.match(result.stderr, /htmlGzip: .* exceeds/);
  assert.doesNotMatch(result.stderr, /\n- html: /);
});
test("combined source includes HTML even when each prior limit passes", () => {
  const result = check({ html: "a".repeat(75 * 1024), css: "a".repeat(283 * 1024),
    runtime: "a".repeat(417 * 1024), font: 110 * 1024 });
  assert.equal(result.status, 1); assert.match(result.stderr, /initialPage: .* exceeds/);
  assert.doesNotMatch(result.stderr, /\n- (css|runtime|fonts|initialSource|html): /);
});
test("combined compressed page includes HTML", () => {
  const result = check({ html: entropy(22_000), css: entropy(65_536),
    runtime: entropy(170_000), font: 112 * 1024 });
  assert.equal(result.status, 1); assert.match(result.stderr, /initialPageCompressed: .* exceeds/);
  assert.doesNotMatch(result.stderr, /\n- (cssGzip|runtimeGzip|initialCompressed|htmlGzip): /);
});
test("prior CSS ceiling is still enforced", () => {
  const result = check({ css: "a".repeat(285 * 1024) });
  assert.equal(result.status, 1); assert.match(result.stderr, /css: .* exceeds/);
});

test("deferred story source has its own ceiling", () => {
  const result = check({story: "a".repeat(81 * 1024)});
  assert.equal(result.status, 1); assert.match(result.stderr, /story: .* exceeds/);
  assert.doesNotMatch(result.stderr, /\n- initialPage: /);
});
test("deferred story compressed bytes remain bounded", () => {
  const result = check({story: entropy(40_000)});
  assert.equal(result.status, 1); assert.match(result.stderr, /storyGzip: .* exceeds/);
});
