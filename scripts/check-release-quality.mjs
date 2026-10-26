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

// Number only confirmed Pages publications; failed candidates and retries do
// not consume a number. Keep these with the existing publication barrier tests.
const { readPublishedVersion, readSiteVersion, prepareSiteVersion, verifyCandidateVersion, versionBaseline, rebaseSiteVersion, nextSiteVersion } = await import('./release-version.mjs');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const versionHtml = version => `<p class="site-version" data-site-version>Версия ${version}</p>`;
const failed = 'f'.repeat(40), successful = 'b'.repeat(40);
const published = await readPublishedVersion({
  readApi: async endpoint => endpoint.startsWith('deployments?')
    ? [{id: 3, sha: failed}, {id: 2, sha: successful}]
    : endpoint.includes('/3/') ? [{state: 'failure'}] : [{state: 'inactive'}, {state: 'success'}],
  readHtml: async sha => { assert.equal(sha, successful); return versionHtml('1.364'); },
});
assert.deepEqual(published, {sha: successful, version: '2.94'});
assert.equal(rebaseSiteVersion('1.270'), '2.0');
assert.equal(rebaseSiteVersion('1.366'), '2.96');
assert.equal(rebaseSiteVersion('2.97'), '2.97');
assert.throws(() => rebaseSiteVersion('1.269'), /predates/);
assert.throws(() => rebaseSiteVersion('garbage'), /predates/);
assert.equal(nextSiteVersion('2.96'), '2.97');
assert.throws(() => nextSiteVersion('1.366'), /Unknown/);
assert.deepEqual(await readPublishedVersion({
  readApi: async endpoint => endpoint.startsWith('deployments?') ? [{id: 1, sha: versionBaseline.sha}] : [{state:'success'}],
  readHtml: async () => { throw new Error('Bootstrap has no version marker'); },
}), versionBaseline);
await assert.rejects(readPublishedVersion({readApi: async () => [], readHtml: async () => ''}), /No successful/);
assert.throws(() => readSiteVersion(''), /one consistent static/);
assert.throws(() => readSiteVersion(versionHtml('1.1') + versionHtml('1.2')), /one consistent static/);
assert.throws(() => readSiteVersion(versionHtml('2.97') + versionHtml('invalid')), /one consistent static/);
const directory = mkdtempSync(join(tmpdir(), 'portfolio-version-'));
try {
  writeFileSync(join(directory, 'index.html'), versionHtml('1.364') + versionHtml('1.364'));
  assert.equal(prepareSiteVersion(directory, published).version, '2.95');
  assert.deepEqual(prepareSiteVersion(directory, published).changedPaths, []);
  const candidate = readFileSync(join(directory, 'index.html'), 'utf8');
  assert.equal(candidate, versionHtml('2.95') + versionHtml('2.95'));
  assert.equal(readSiteVersion(candidate), '2.95');
  verifyCandidateVersion(candidate, failed, published);
  verifyCandidateVersion(candidate, failed, {sha: failed, version:'2.95'});
  assert.throws(() => verifyCandidateVersion(candidate, failed, {sha: 'c'.repeat(40), version: '2.95'}), /stale/);
} finally { rmSync(directory, {recursive:true, force:true}); }
console.log('PASS site version: confirmed success, version 2 baseline, synchronized labels, failed/repeated candidates, resume and concurrent publication.');
const pendingApi = async endpoint => endpoint.startsWith('deployments?')
  ? [{id: 2, sha: failed}, {id: 1, sha: versionBaseline.sha}]
  : endpoint.includes('/2/') ? [{state:'in_progress'}] : [{state:'success'}];
await assert.rejects(readPublishedVersion({readApi:pendingApi,readHtml:async()=>''}), /still pending/);
assert.deepEqual(await readPublishedVersion({readApi:pendingApi,readHtml:async()=>'',pendingCommit:failed}), versionBaseline);
const { getPublicationAssets } = await import('./publication-assets.mjs');
const { fileURLToPath } = await import('node:url');
const independent = getPublicationAssets(fileURLToPath(new URL('../', import.meta.url)), {staticScope:'checks',components:['checks'],files:[]});
assert.ok(independent.htmlHash && independent.html.includes('data-site-version'));
assert.ok(!independent.assets.some(asset => asset.path.startsWith('js/')));
console.log('PASS version serialization and independent HTML publication proof.');
