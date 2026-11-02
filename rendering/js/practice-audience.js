// Monthly audience snapshot: unique visitors, 1-31 October 2026.
// Refresh on each month's first day using the complete previous calendar month.
// Metrica and Tilda monthly reports; source limits: docs/practice-audience.md.
// Missing counters use the measured median, explicitly approved by the author.
// These are relative weights, not live analytics and not a quality ranking.
export const audiencePeriod = { start: '2026-10-01', end: '2026-10-31' };
export const neutralAudienceProjects = ['dd-camp'];
export const audienceWeights = {
  'ks-fish': 0.490988530857,
  'eleven': 0.072091753140,
  'herman': 0.017476788640,
  'tarski': 0.051338066630,
  'hotline-camp': 0.046968869470,
  'krainiuk': 0.113052976516,
  'shirokostup': 0.001092299290,
  'dusty': 0.128345166576,
  'dd-camp': 0.051338066630,
  'doronin': 0.027307482250,
};

// Every project has a base mass; monthly audience adds a gentle logarithmic share.
// Measure the reference before including neutral substitutes.
const measured = Object.entries(audienceWeights)
  .filter(([id]) => !neutralAudienceProjects.includes(id))
  .map(([, weight]) => weight).sort((a, b) => a - b);
const middle = Math.floor(measured.length / 2);
const median = (measured[middle] + measured[Math.floor((measured.length - 1) / 2)]) / 2;
export const audienceMassWeights = Object.fromEntries(Object.entries(audienceWeights)
  .map(([id, audience]) => [id, 1 + Math.log1p(audience / median)]));

// Visible area, not diameter, follows the same mass. The median project's
// diameter remains the reference across months and all three renderers.
export const audienceSizeScales = Object.fromEntries(Object.entries(audienceMassWeights)
  .map(([id, mass]) => [id, Math.sqrt(mass / (1 + Math.LN2))]));
