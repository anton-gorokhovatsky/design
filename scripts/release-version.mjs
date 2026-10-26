import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reconstructed from distinct Pages publications since the first custom-domain
// deployment (53229007, 24 July 2026). Older GitHub status history is incomplete.
export const versionBaseline = { sha: '80f51f617c9259f91e833a7e8d701f618e8f9d71', version: '1.363' };
const versionPattern = /(<p\b[^>]*\bdata-site-version(?:="")?[^>]*>Версия )(\d+\.\d+)(<\/p>)/g;
export const readSiteVersion = html => {
  const matches = [...html.matchAll(versionPattern)];
  if (matches.length !== 1) throw new Error('Expected one static site version in settings.');
  return matches[0][2];
};
export const nextSiteVersion = version => {
  if (!/^1\.\d+$/.test(version)) throw new Error(`Unknown site version: ${version}`);
  return `1.${Number(version.split('.')[1]) + 1}`;
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
      return { sha: deployment.sha, version };
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
