import assert from "node:assert/strict";
import { selectQualityRun, waitForQuality } from "./release-quality.mjs";

const commit = "a".repeat(40);
const green = {
  headSha: commit, headBranch: "main", event: "push", workflowName: "Quality",
  databaseId: 10, status: "completed", conclusion: "success", url: "https://example.test/run/10",
};
assert.equal(selectQualityRun([
  { ...green, headSha: "b".repeat(40) },
  { ...green, event: "pull_request" },
  { ...green, headBranch: "other" },
  { ...green, workflowName: "Pages" },
], commit), undefined);
assert.equal(selectQualityRun([green, { ...green, databaseId: 11, conclusion: "failure" }], commit).conclusion, "failure");
const check = (runs, options = {}) => {
  let time = 0;
  let index = 0;
  return waitForQuality({
    commit, readRuns: async () => runs[Math.min(index++, runs.length - 1)],
    now: () => time, sleep: async (ms) => { time += ms; },
    log: () => {}, timeoutMs: 30, intervalMs: 10, ...options,
  });
};
assert.equal(await check([[], [{ ...green, status: "in_progress", conclusion: "" }], [green]]), green);
for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "neutral", "action_required"]) {
  await assert.rejects(check([[{ ...green, conclusion }]]), /gh-pages was not updated/);
}
await assert.rejects(check([[]]), /did not succeed/);
await assert.rejects(check([[{ ...green, status: "in_progress", conclusion: "" }]]), /did not succeed/);
await assert.rejects(check([[green]], { commit: "short" }), /full commit SHA/);
await assert.rejects(check([[green]], { readRuns: async () => { throw new Error("GitHub unavailable"); } }), /GitHub unavailable/);
console.log("PASS release barrier: exact SHA, main push, latest run, success only; fail closed on timeout/error.");
