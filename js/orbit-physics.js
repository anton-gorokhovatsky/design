// Newtonian point masses in a plane, in arbitrary units. No damping,
// softened force, spring-to-orbit correction or positional clamp.
export const GM = (2 * Math.PI / 22) ** 2 * .43 ** 3;
export const STEP = 1 / 120;

// Dormand–Prince 5(4): accept the fifth-order state only after estimating
// its local error against the embedded fourth-order solution.
const A = [[], [1/5], [3/40, 9/40], [44/45, -56/15, 32/9],
  [19372/6561, -25360/2187, 64448/6561, -212/729],
  [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
  [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84]];
const E = [35/384-5179/57600, 0, 500/1113-7571/16695,
  125/192-393/640, -2187/6784+92097/339200, 11/84-187/2100, -1/40];

export function createSystem(seeds, options = {}) {
  const { totalSatelliteMass = .0005, weights = null } = options;
  const factors = seeds.map(seed => weights?.[seed.id] ?? 1);
  const total = factors.reduce((sum, weight) => sum + weight, 0);
  const bodies = [{ id: 'core', mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
    ...seeds.map((seed, i) => {
      const speed = Math.sqrt(GM / seed.radius);
      return { id: seed.id, mass: totalSatelliteMass * factors[i] / total,
        x: seed.radius * Math.cos(seed.phase), y: seed.radius * Math.sin(seed.phase),
        vx: -speed * Math.sin(seed.phase), vy: speed * Math.cos(seed.phase) };
    })];
  const mass = bodies.reduce((sum, body) => sum + body.mass, 0);
  for (const key of ['x', 'y', 'vx', 'vy']) {
    const barycenter = bodies.reduce((sum, body) => sum + body[key] * body.mass, 0) / mass;
    for (const body of bodies) body[key] -= barycenter;
  }
  const relativeTolerance = options.relativeTolerance ?? 1e-10;
  const absoluteTolerance = options.absoluteTolerance ?? 1e-12;
  const maxStep = STEP;
  const maxSubsteps = 4096;
  if (!(relativeTolerance > 0) || !(absoluteTolerance > 0)) throw new RangeError('Positive integration tolerances required');
  const size = bodies.length * 4;
  let state = Float64Array.from(bodies.flatMap(b => [b.x, b.y, b.vx, b.vy]));
  let trial = new Float64Array(size), proposedStep = maxStep, time = 0, failure = null;
  const stages = Array.from({ length: 7 }, () => new Float64Array(size));
  const derivative = (y, out) => {
    for (let i = 0; i < bodies.length; i++) {
      out[4*i] = y[4*i+2]; out[4*i+1] = y[4*i+3];
      out[4*i+2] = out[4*i+3] = 0;
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i+1; j < bodies.length; j++) {
      const dx = y[4*j]-y[4*i], dy = y[4*j+1]-y[4*i+1];
      const r2 = dx*dx+dy*dy;
      const factor = GM / (r2*Math.sqrt(r2));
      out[4*i+2] += dx*factor*bodies[j].mass; out[4*i+3] += dy*factor*bodies[j].mass;
      out[4*j+2] -= dx*factor*bodies[i].mass; out[4*j+3] -= dy*factor*bodies[i].mass;
    }
  };
  derivative(state, stages[0]);
  const publish = () => {
    for (let i = 0; i < bodies.length; i++) Object.assign(bodies[i], {
      x: state[4*i], y: state[4*i+1], vx: state[4*i+2], vy: state[4*i+3],
    });
  };
  const stop = reason => { failure = reason; publish(); return false; };
  return { bodies, get time() { return time; }, get failure() { return failure; }, step(duration = STEP) {
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError('Finite nonnegative duration required');
    if (failure) return false;
    const end = time + duration;
    let attempts = 0;
    while (time < end) {
      // Ignore only endpoint roundoff, never an unresolved encounter.
      if (end-time <= 8*Number.EPSILON*Math.max(1,end)) { time=end; break; }
      if (++attempts > maxSubsteps) return stop('step-budget');
      const h = Math.min(proposedStep, maxStep, end-time);
      if (time+h === time) return stop('precision-limit');
      for (let s = 1; s < 7; s++) {
        for (let i = 0; i < size; i++) {
          let sum = 0;
          for (let j = 0; j < s; j++) sum += A[s][j]*stages[j][i];
          trial[i] = state[i] + h*sum;
        }
        derivative(trial, stages[s]);
      }
      let error = 0;
      for (let i = 0; i < size; i++) {
        let sum = 0;
        for (let s = 0; s < 7; s++) sum += E[s]*stages[s][i];
        const scale = absoluteTolerance + relativeTolerance*Math.max(Math.abs(state[i]), Math.abs(trial[i]));
        error = Math.max(error, Math.abs(h*sum)/scale);
      }
      if (!Number.isFinite(error)) error = Infinity;
      const nextStep = h*Math.max(.1, Math.min(4, .9*Math.pow(error || 1e-16, -.2)));
      // A short frame remainder must not shrink the next frame's trial step.
      proposedStep = h === end-time && error <= 1 ? Math.max(proposedStep, nextStep) : nextStep;
      if (error > 1) continue;
      [state, trial] = [trial, state];
      stages[0].set(stages[6]);
      time = h === end-time ? end : time+h;
    }
    publish();
    return true;
  } };
}
