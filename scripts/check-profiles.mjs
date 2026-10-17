// Ownership boundaries for independently published artifacts and check tooling.
// Runtime outside these boundaries keeps the portfolio's existing coverage.
const processPaths = new Set([
  '.github/workflows/quality.yml',
  'scripts/check-profiles.mjs', 'scripts/check-project.mjs',
  'scripts/check-catalog.mjs', 'scripts/release-scope.mjs',
  'scripts/component-scope.mjs', 'scripts/media-scope.mjs',
  'scripts/release.mjs', 'scripts/release-quality.mjs',
  'scripts/check-release-scope.mjs', 'scripts/check-release-quality.mjs',
  'scripts/check-runner.mjs', 'scripts/check-signature.mjs',
  'scripts/check-signature-static.mjs', 'scripts/publication-assets.mjs',
  'scripts/point-address-scope.mjs', 'scripts/check-point-address.mjs',
  'scripts/check-local-ui.mjs',
]);
const signaturePath = /^signature\/(?:src\/[^/]+\.(?:js|css|svg)|(?:v1|\d+\.\d+\.\d+)\/signature\.js|build\.mjs|demo\.html|README\.md|codex\/(?:SKILL|AGENTS\.fragment)\.md)$/;
export const ownedCheckComponent = path => signaturePath.test(path)
  ? 'signature' : processPaths.has(path) ? 'checks' : null;

const step = script => ({ label: script, command: process.execPath, args: [script] });
export const checkProfiles = {
  signature: {
    syntax: ['signature/src/component.js', 'signature/build.mjs',
      'scripts/check-signature-static.mjs', 'scripts/check-signature.mjs'],
    static: [step('scripts/check-signature-static.mjs')],
  },
  checks: {
    syntax: [...processPaths].filter(path => path.endsWith('.mjs')),
    static: ['scripts/check-release-scope.mjs', 'scripts/check-release-quality.mjs',
      'scripts/check-runner.mjs', 'scripts/check-signature-static.mjs'].map(step),
  },
};
export const staticScopeFor = (mode, components) => {
  if (mode === 'full' || components.some(id => !['signature', 'checks'].includes(id))) {
    return mode === 'full' || components.some(id => ['media', 'signature', 'checks'].includes(id)) ? 'static' : 'copy';
  }
  return components.includes('checks') ? 'checks' : components.includes('signature') ? 'signature' : 'copy';
};
export const localScopeFor = plan => plan.staticScope === 'static' ? 'copy' : plan.staticScope;
export const onlyIndependentChecks = plan => ['signature', 'checks'].includes(plan.staticScope);
