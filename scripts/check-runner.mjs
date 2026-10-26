import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserSteps } from './check-catalog.mjs';
import { getPublicationAssets } from './publication-assets.mjs';
import { localScopeFor } from './check-profiles.mjs';
const root = process.cwd();
const plan = (...args) => JSON.parse(execFileSync(process.execPath, ['scripts/check-project.mjs', '--list', ...args], { encoding: 'utf8' }));
const signature = plan('--scope=signature');
assert.deepEqual(signature.static.map(s => s.args[0]), ['scripts/check-signature-static.mjs', 'diff']);
assert(signature.syntax.every(s => /^(signature\/|scripts\/check-signature)/.test(s.args.at(-1))));
assert.deepEqual(signature.browser, []);
for (const engine of ['chromium', 'webkit']) {
  const selected = plan(`--scope=${engine}`, '--checks=signature');
  assert.deepEqual(selected.browser.map(s => s.args), [['scripts/check-signature.mjs', engine]]);
  assert.deepEqual(selected.reels, []);
  assert.deepEqual(selected.static, []);
  assert.deepEqual(selected.syntax, []);
  const address = plan(`--scope=${engine}`, '--checks=point-address');
  assert.deepEqual(address.browser.map(s => s.args), [['scripts/check-point-address.mjs', engine]]);
  assert.deepEqual(address.reels, []);
  assert.deepEqual(address.static, []);
  for (const component of ['header', 'search-icon']) {
    const localUi = plan(`--scope=${engine}`, `--checks=${component}`);
    assert.deepEqual(localUi.browser.map(s => s.args), [['scripts/check-local-ui.mjs', engine, component]]);
    assert.deepEqual(localUi.reels, []);
    assert.deepEqual(localUi.static, []);
  }
}
const checks = plan('--scope=checks');
assert.deepEqual(checks.static.map(s => s.args[0]), ['scripts/check-release-scope.mjs', 'scripts/check-release-quality.mjs', 'scripts/check-runner.mjs', 'scripts/check-signature-static.mjs', 'diff']);
assert(!JSON.stringify([signature, checks]).includes('audit-project'));
assert(!JSON.stringify([signature, checks]).includes('prepare-reels'));
assert.deepEqual(plan('--scope=all').browser.map(s => s.args), ['chromium', 'webkit'].flatMap(engine => browserSteps(engine).map(s => s.args)));
for (const args of [['--scope=signatur'], ['--scope=signature', '--scope=all'], ['--scope=chromium', '--checks='], ['--scope=webkit', '--checks=reels'], ['--scope=chromium', '--checks=signature,signature']]) {
  assert.equal(spawnSync(process.execPath, ['scripts/check-project.mjs', '--list', ...args]).status, 2, `Reject invalid selection: ${args}`);
}
assert.equal(localScopeFor({ staticScope: 'signature' }), 'signature');
assert.equal(localScopeFor({ staticScope: 'checks' }), 'checks');
assert.equal(localScopeFor({ staticScope: 'static' }), 'copy', 'The existing short portfolio preflight is retained');
const assets = getPublicationAssets(root, { staticScope: 'signature', components: ['signature'] });
assert.equal(assets.html, readFileSync(join(root, 'index.html'), 'utf8'), 'Every release proves its exact HTML with the site version');
assert.match(assets.html, /data-site-version/);
assert.match(assets.htmlHash, /^[a-f0-9]{64}$/);
assert(assets.assets.every(asset => asset.path.startsWith('signature/')), 'Signature publication does not wait on portfolio assets');
const tooling = getPublicationAssets(root, { staticScope: 'checks', components: ['checks'] });
assert(tooling.assets.some(a => a.path === 'scripts/check-profiles.mjs'), 'A check-only release proves its own Pages payload');
const changedTooling = getPublicationAssets(root, { staticScope: 'checks', components: ['checks'],
  files: ['scripts/release-scope.mjs', 'scripts/component-scope.mjs', '.github/workflows/quality.yml', 'AGENTS.md'] });
assert(changedTooling.assets.some(a => a.path === 'scripts/release-scope.mjs'));
assert(changedTooling.assets.some(a => a.path === 'scripts/component-scope.mjs'), 'Unchanged helper hashes cannot prove deployment of the changed classifier');
assert(!changedTooling.assets.some(a => a.path.startsWith('.github/')), 'GitHub Pages does not serve hidden workflow files');
const mixedAssets = getPublicationAssets(root, { staticScope: 'static', components: ['signature'] });
assert(mixedAssets.html !== null);
assert(mixedAssets.assets.some(a => a.path.startsWith('signature/') && !a.linked), 'Mixed releases verify the shared module without requiring its demo link in portfolio HTML');
const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
assert(workflow.includes('runs-on: ${{ matrix.runner }}'));
assert(workflow.includes('run: node scripts/check-project.mjs --scope=${{ matrix.browser }} --checks=${{ matrix.checks }}'));
assert(workflow.includes('components|full) test "$BROWSER_RESULT" = success'));
assert(workflow.includes('test "$STATIC_RESULT" = success'));

// Real failures must block the signature gate; checking must not repair files.
const directory = mkdtempSync(join(tmpdir(), 'signature-gate-negative-'));
try {
  cpSync('signature', join(directory, 'signature'), { recursive: true });
  mkdirSync(join(directory, 'scripts'));
  cpSync('scripts/check-signature-static.mjs', join(directory, 'scripts/check-signature-static.mjs'));
  const git = args => execFileSync('git', ['-c', 'user.name=Gate test', '-c', 'user.email=gate@example.invalid', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: directory, stdio: 'pipe' });
  git(['init', '-b', 'main']); git(['add', '.']); git(['commit', '-m', 'published']);
  const run = () => spawnSync(process.execPath, ['scripts/check-signature-static.mjs'], { cwd: directory, env: { ...process.env, SIGNATURE_BASE: 'HEAD' }, encoding: 'utf8' });
  assert.equal(run().status, 0);
  const bundle = join(directory, 'signature/v1/signature.js');
  const original = readFileSync(bundle, 'utf8');
  const broken = original + '\n// stale bundle\n';
  writeFileSync(bundle, broken);
  const stale = run();
  assert.notEqual(stale.status, 0);
  assert(stale.stderr.includes('v1 matches a clean build'));
  assert.equal(readFileSync(bundle, 'utf8'), broken, 'Checking never silently regenerates a stale bundle');
  writeFileSync(bundle, original);
  const immutable = join(directory, 'signature/1.0.1/signature.js');
  writeFileSync(immutable, readFileSync(immutable, 'utf8') + '\n// forbidden rewrite\n');
  const rewritten = run();
  assert.notEqual(rewritten.status, 0);
  assert(rewritten.stderr.includes('Published release must not be overwritten'));
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log('Check runner: actual plans, isolated publication, invalid selections, and blocking bundle/archive failures passed.');
