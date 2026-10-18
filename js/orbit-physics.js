// Newtonian model: Newtonian point masses in one plane, in arbitrary units.
// No damping, spring-to-orbit force or positional clamping is applied.
export const GM = (2 * Math.PI / 22) ** 2 * .43 ** 3;
export const STEP = 1 / 120;

export function createSystem(seeds, { totalSatelliteMass = .0005, weights = null } = {}) {
  const factors = seeds.map(seed => weights?.[seed.id] ?? 1);
  const total = factors.reduce((sum, weight) => sum + weight, 0);
  const bodies = [{ id: 'core', mass: 1, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 },
    ...seeds.map((seed, i) => {
      const speed = Math.sqrt(GM / seed.radius);
      return { id: seed.id, mass: totalSatelliteMass * factors[i] / total,
        x: seed.radius * Math.cos(seed.phase), y: seed.radius * Math.sin(seed.phase),
        vx: -speed * Math.sin(seed.phase), vy: speed * Math.cos(seed.phase), ax: 0, ay: 0 };
    })];
  const mass = bodies.reduce((sum, body) => sum + body.mass, 0);
  for (const key of ['x', 'y', 'vx', 'vy']) {
    const barycenter = bodies.reduce((sum, body) => sum + body[key] * body.mass, 0) / mass;
    for (const body of bodies) body[key] -= barycenter;
  }
  const accelerations = () => {
    for (const body of bodies) body.ax = body.ay = 0;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], dx = b.x - a.x, dy = b.y - a.y;
      const r2 = dx * dx + dy * dy;
      if (r2 < 1e-12) throw new Error('Point-mass collision: initial conditions need review');
      const force = GM / (r2 * Math.sqrt(r2));
      a.ax += dx * force * b.mass; a.ay += dy * force * b.mass;
      b.ax -= dx * force * a.mass; b.ay -= dy * force * a.mass;
    }
  };
  accelerations();
  return { bodies, step(dt = STEP) {
    // Velocity Verlet: symmetric kicks around a position update.
    for (const body of bodies) {
      body.vx += body.ax * dt / 2; body.vy += body.ay * dt / 2;
      body.x += body.vx * dt; body.y += body.vy * dt;
    }
    accelerations();
    for (const body of bodies) {
      body.vx += body.ax * dt / 2; body.vy += body.ay * dt / 2;
    }
  } };
}

export function energy(bodies) {
  let result = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]; result += .5 * a.mass * (a.vx ** 2 + a.vy ** 2);
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]; result -= GM * a.mass * b.mass / Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return result;
}
