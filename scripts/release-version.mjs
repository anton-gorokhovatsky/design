import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Version 2 starts with the first successful publication of the open Index panel.
// Pages deployment 6885721275 succeeded on 6 October 2026 at 16:48:57 Moscow.
// It was 1.270 in the original custom-domain publication ledger.
export const versionEpoch = { sha: 'dee7bf12ef7de62fef4636e0691c558392bfedca', previousMinor: 270 };
// Last publication before the HTML version marker was introduced: 1.363 -> 2.93.
export const versionBaseline = { sha: '80f51f617c9259f91e833a7e8d701f618e8f9d71', version: '2.93' };
const versionPattern = /(<p\b[^>]*\bdata-site-version(?:="")?[^>]*>Версия )(\d+\.\d+)(<\/p>)/g;
export const readSiteVersion = html => {
  const matches = [...html.matchAll(versionPattern)];
  const labels = [...html.matchAll(/<p\b[^>]*\bdata-site-version(?=\s|=|>)[^>]*>/g)];
  if (!matches.length || matches.length !== labels.length || new Set(matches.map(match => match[2])).size !== 1) throw new Error('Expected one consistent static site version.');
  return matches[0][2];
};
export const nextSiteVersion = version => {
  if (!/^2\.\d+$/.test(version)) throw new Error(`Unknown site version: ${version}`);
  return `2.${Number(version.split('.')[1]) + 1}`;
};

export const rebaseSiteVersion = version => {
  if (/^2\.\d+$/.test(version)) return version;
  if (!/^1\.\d+$/.test(version) || Number(version.split('.')[1]) < versionEpoch.previousMinor) {
    throw new Error(`Publication predates the version 2 baseline: ${version}`);
  }
  return `2.${Number(version.split('.')[1]) - versionEpoch.previousMinor}`;
};

// A gh-pages ref alone is insufficient: Pages may have failed after the push.
// Read the newest deployment with an actual retained success status instead.
export const readPublishedVersion = async ({ readApi, readHtml, pendingCommit }) => {
  for (let page = 1; ; page += 1) {
    const deployments = await readApi(`deployments?environment=github-pages&per_page=100&page=${page}`);
    for (const deployment of deployments) {
      const statuses = await readApi(`deployments/${deployment.id}/statuses?per_page=100`);
      if ((!statuses.length || ['queued', 'pending', 'waiting', 'in_progress'].includes(statuses[0].state)) && deployment.sha !== pendingCommit) {
        throw new Error('A previous Pages publication is still pending; wait before assigning the next site version.');
      }
      if (!statuses.some(status => status.state === 'success')) continue;
      const version = deployment.sha === versionBaseline.sha
        ? versionBaseline.version : readSiteVersion(await readHtml(deployment.sha));
      return { sha: deployment.sha, version: rebaseSiteVersion(version) };
    }
    if (deployments.length < 100) throw new Error('No successful Pages publication found; site version was not changed.');
  }
};
export const prepareSiteVersion = (projectRoot, published) => {
  const path = resolve(projectRoot, 'index.html');
  const before = readFileSync(path, 'utf8');
  readSiteVersion(before);
  const version = nextSiteVersion(published.version);
  const after = before.replace(versionPattern, (_, start, _version, end) => `${start}${version}${end}`);
  if (after !== before) writeFileSync(path, after);
  return { version, changedPaths: after === before ? [] : ['index.html'] };
};
export const verifyCandidateVersion = (html, commit, published) => {
  const expected = commit === published.sha ? published.version : nextSiteVersion(published.version);
  if (readSiteVersion(html) !== expected) throw new Error(`Release version is stale; expected ${expected}. Nothing was published.`);
};
