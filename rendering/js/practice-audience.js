// Initial audience snapshot: unique visitors, 18 September–17 October 2026.
// From 1 November 2026, refresh on each month's first day using the complete
// previous calendar month (Europe/Moscow). See docs/practice-audience.md.
// Missing counters use the measured median, explicitly approved by the author.
// These are relative weights, not live analytics and not a quality ranking.
export const audiencePeriod = { start: '2026-09-18', end: '2026-10-17' };
export const neutralAudienceProjects = ['dusty', 'dd-camp', 'doronin'];
export const audienceWeights = {
  'ks-fish': 0.532051282051,
  'eleven': 0.134615384615,
  'herman': 0.018589743590,
  'tarski': 0.042948717949,
  'hotline-camp': 0.046153846154,
  'krainiuk': 0.085897435897,
  'shirokostup': 0.001282051282,
  'dusty': 0.046153846154,
  'dd-camp': 0.046153846154,
  'doronin': 0.046153846154,
};

// Every project has a base mass; monthly audience adds a gentle logarithmic share.
// Measure the reference before including the three neutral substitutes.
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
