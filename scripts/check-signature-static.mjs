import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(resolve(root, path), 'utf8');
const source = read('signature/src/component.js');
const version = source.match(/export const VERSION = "([\d.]+)";/)?.[1];
assert(version, 'Signature source declares its release version');
const directory = mkdtempSync(join(tmpdir(), 'author-signature-build-'));
try {
  cpSync(resolve(root, 'signature/src'), join(directory, 'src'), { recursive: true });
  cpSync(resolve(root, 'signature/build.mjs'), join(directory, 'build.mjs'));
  execFileSync(process.execPath, [join(directory, 'build.mjs')], { stdio: 'pipe' });
  const expected = readFileSync(join(directory, 'v1/signature.js'), 'utf8');
  assert.equal(read('signature/v1/signature.js'), expected, 'v1 matches a clean build; the check never rewrites the working copy');
  assert.equal(read(`signature/${version}/signature.js`), expected, 'The current fixed release matches v1');
  execFileSync(process.execPath, ['--check', resolve(root, 'signature/v1/signature.js')], { stdio: 'pipe' });
  assert(!/^\s*import\s/m.test(expected), 'The published component has no runtime imports');
  assert(!expected.includes('__SIGNATURE_CSS__') && !expected.includes('__SIGNATURE_SVG__'), 'No build placeholders reach consumers');

  // Exact published releases are immutable, including when a new version is added.
  const base = process.env.SIGNATURE_BASE || 'origin/gh-pages';
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  const paths = git(['ls-tree', '-r', '--name-only', base, '--', 'signature']).split('\n')
    .filter(path => /^signature\/\d+\.\d+\.\d+\/signature\.js$/.test(path));
  for (const path of paths) {
    assert(existsSync(resolve(root, path)), `Published release must remain available: ${path}`);
    assert.equal(read(path), git(['show', `${base}:${path}`]), `Published release must not be overwritten: ${path}`);
  }
  const demo = read('signature/demo.html');
  assert(demo.includes("import('./v1/signature.js')"), 'The standalone example uses the shared bundle');
  assert(demo.includes('rel="author"') && demo.includes(".has('fallback')"), 'The example retains the plain author-link fallback');
  console.log(`Signature static checks passed: reproducible v${version}, ${paths.length} immutable releases, standalone example.`);
} finally { rmSync(directory, { recursive: true, force: true }); }
