import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onlyIndependentChecks } from './check-profiles.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export const getPublicationAssets = (root, plan) => {
  const independent = onlyIndependentChecks(plan);
  const html = independent ? null : readFileSync(resolve(root, 'index.html'), 'utf8');
  const references = html ? [...html.matchAll(/(?:src|href)=["']((?:styles\.css|(?:js|assets)\/[^"'?#]+)(?:\?[^"']*)?)["']/g)].map(m => m[1]) : [];
  const linkedReferences = new Set(references);
  if (independent || plan.components.includes('signature')) {
    const version = readFileSync(resolve(root, 'signature/src/component.js'), 'utf8').match(/VERSION = "([\d.]+)"/)[1];
    references.push('signature/v1/signature.js', `signature/${version}/signature.js`, 'signature/demo.html', 'signature/README.md');
  }
  if (plan.staticScope === 'checks') {
    // Changed public tooling also proves that this Pages deployment has arrived,
    // even though the signature and all portfolio runtime bytes are unchanged.
    references.push('scripts/check-project.mjs', 'scripts/check-profiles.mjs', 'scripts/publication-assets.mjs');
  }
  return {
    html, htmlHash: html === null ? null : hash(html),
    assets: [...new Set(references)].map(reference => {
      const path = reference.split(/[?#]/, 1)[0];
      if (!existsSync(resolve(root, path))) {
        if (independent) throw new Error(`Missing publication asset: ${path}`);
        return null;
      }
      const digest = hash(readFileSync(resolve(root, path)));
      return { path, hash: digest, linked: linkedReferences.has(reference), reference: independent ? `${reference}?v=${digest.slice(0,12)}` : reference,
        module: /^signature\/.*\/signature\.js$/.test(path) };
    }).filter(Boolean),
  };
};
