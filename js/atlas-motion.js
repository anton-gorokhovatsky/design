// Native Atlas export frames, recoloured with the owning surface's semantic ink.
// Static SVG stays available with no JavaScript, reduced motion or failed fetch.
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const contrast = matchMedia('(forced-colors: active), (prefers-contrast: more)');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
let exportedFrames;
function loadFrames() {
  return exportedFrames ||= fetch('/assets/atlas-motion.json').then(response => {
    if (!response.ok) throw new Error('Atlas unavailable');
    return response.json();
  });
}
for (const field of document.querySelectorAll('.whoop-field, .not-found__terrain')) {
  // The author terrain is ambient; retain Atlas's timing ratios at a slower pace.
  const playbackRate = field.matches('.whoop-field') ? 1 / 3 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  canvas.className = 'atlas-motion'; canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) continue;
  context.scale(2, 2);
  let data, loading = false, failed = false, timer = 0, running = false;
  let elapsed = 0, started = 0, frame = -1, ink = '', pendingSync = 0;
  const paths = [];
  const allowed = () => !document.hidden && !reduced.matches && !contrast.matches
    && root.dataset.reduceMotion !== 'true'
    && getComputedStyle(field).visibility !== 'hidden' && getComputedStyle(field).display !== 'none'
    && (!field.matches('.whoop-field') || getComputedStyle(root).getPropertyValue('--day-enabled').trim() === '1');
  function draw(index) {
    if (!paths[index]) {
      const bands = Array.from({ length: 8 }, () => new Path2D());
      [...data.frames[index]].forEach((code, i) => {
        const value = alphabet.indexOf(code), level = Math.floor(value / 5), kind = value % 5;
        if (!kind) return;
        const x = (i % data.columns + .5) * 960 / data.columns;
        const y = (Math.floor(i / data.columns) + .5) * 540 / data.rows - .35;
        const p = bands[level], r = 1.65;
        if (kind === 1 || kind === 2) {
          const top = y - (kind === 2 ? 1.8 : 0);
          p.moveTo(x, top); p.lineTo(x, top + .1);
          if (kind === 2) { p.moveTo(x, top + 3.5); p.lineTo(x, top + 3.6); }
        } else if (kind === 3) {
          p.moveTo(x - r, y); p.lineTo(x + r, y); p.moveTo(x, y - r); p.lineTo(x, y + r);
        } else {
          p.moveTo(x - r, y - r); p.lineTo(x + r, y + r); p.moveTo(x + r, y - r); p.lineTo(x - r, y + r);
        }
      });
      paths[index] = bands;
    }
    context.clearRect(0, 0, 960, 540);
    context.strokeStyle = ink; context.lineWidth = 1.1; context.lineCap = 'round';
    paths[index].forEach((path, level) => { context.globalAlpha = .18 + level * .105; context.stroke(path); });
    if (!canvas.isConnected) { field.append(canvas); field.dataset.atlasReady = 'true'; }
    frame = index;
  }
  function tick() {
    const position = ((elapsed + performance.now() - started) * playbackRate) % data.duration;
    let next = data.times.findIndex(time => time > position);
    if (next < 0) next = data.times.length;
    const index = next - 1, colour = getComputedStyle(field).color;
    if (index !== frame || colour !== ink) { ink = colour; draw(index); }
    timer = setTimeout(tick, Math.max(16, ((data.times[next] ?? data.duration) - position) / playbackRate));
  }
  function sync() {
    pendingSync = 0;
    const play = allowed();
    if (!play && running) {
      elapsed += performance.now() - started; running = false; clearTimeout(timer);
    }
    if (frame >= 0 && ink !== getComputedStyle(field).color) { ink = getComputedStyle(field).color; draw(frame); }
    if (!play || failed) return;
    if (!data) {
      if (!loading) {
        loading = true;
        loadFrames().then(value => { data = value; sync(); }).catch(() => { failed = true; });
      }
      return;
    }
    if (!running) { running = true; started = performance.now(); tick(); }
  }
  const schedule = () => { if (!pendingSync) pendingSync = requestAnimationFrame(sync); };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { attributes: true });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-case-open'] });
  for (const node of [field, document.querySelector('.map-inspector'), document.querySelector('.practice-map')]) {
    if (node) observer.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-observation-active'] });
  }
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', () => { if (running) { elapsed += performance.now() - started; running = false; clearTimeout(timer); } });
  reduced.addEventListener('change', sync); contrast.addEventListener('change', sync);
  sync();
}
