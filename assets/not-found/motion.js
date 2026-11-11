// The silhouette stays still. Only the source's gas brightness changes.
// A bounded canvas repaint is necessary here: rotating the whole image would
// rotate the hole rather than its disk. At most15painted frames/s, no idle RAF.
const root = document.documentElement;
const scene = document.querySelector('.not-found__hole');
const canvas = scene.querySelector('canvas');
const ctx = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const contrast = matchMedia('(forced-colors: active), (prefers-contrast: more)');
let savedReduced = false;
try { savedReduced = localStorage.getItem('anton-signal-reduced-motion') === '1'; } catch {}
let frame = null, timer = 0, previous = 0, time = 8;
let inView = true, loading = false;
let width = 0, height = 0, color = '';
// One arrival gesture. The shape and text stay visible; ambient gas continues.
let entrance = 0;
const arrivalDuration = .95;
const drawArrival = lines => {
  const progress = Math.min(1, entrance / arrivalDuration);
  scene.dataset.arrival = progress < 1 ? 'arriving' : 'settled';
  if(progress === 0 || progress === 1) return;
  const front = -Math.PI + progress * Math.PI * 2;
  const strength = Math.sin(Math.PI * progress);
  const advance = ctx.measureText('M').width;
  ctx.fillStyle = root.dataset.theme === 'dark' ? '#fff0c5' : '#5e3914';
  for(let row=0;row<lines.length;row++) {
    const y = (row + 1) * 20;
    for(let col=0;col<lines[row].length;col++) {
      const glyph = lines[row][col];
      if(glyph === ' ') continue;
      const x = col * 10;
      const angle = Math.atan2((y - 366) * 1.5, x - 475);
      const distance = Math.atan2(Math.sin(angle-front),Math.cos(angle-front));
      const alpha = strength * Math.exp(-(distance*distance)/.17);
      if(alpha < .005) continue;
      ctx.globalAlpha = alpha;
      ctx.fillText(glyph,col * advance,y);
    }
  }
  ctx.globalAlpha = 1;
};
const noMotion = () => reduced.matches || savedReduced || contrast.matches;
const canPlay = () => frame && !noMotion() && inView && !document.hidden;
const draw = () => {
  if(!frame || !width || !height || noMotion()) return;
  const lines = frame(time).split('\n');
  ctx.setTransform(width / 960, 0, 0, height / 460, 0, -120 * height / 460);
  ctx.clearRect(0, 120, 960, 460);
  ctx.fillStyle = color;
  ctx.font = "16.666667px Consolas, 'Liberation Mono', monospace";
  ctx.textBaseline = 'alphabetic';
  const glyphScale = 10 / ctx.measureText('M').width;
  ctx.save(); ctx.scale(glyphScale,1);
  for(let row=0;row<lines.length;row++) ctx.fillText(lines[row],0,(row+1)*20);
  drawArrival(lines);
  ctx.restore();
  scene.dataset.rendered = '';
};
const size = () => {
  const rect = scene.getBoundingClientRect(), ratio = Math.min(2, devicePixelRatio || 1);
  width = Math.round(rect.width * ratio); height = Math.round(rect.height * ratio);
  if(canvas.width !== width) canvas.width = width;
  if(canvas.height !== height) canvas.height = height;
  color = getComputedStyle(scene).color;
  draw();
};
const tick = () => {
  timer = 0;
  if(!canPlay()) return;
  const now = performance.now();
  const elapsed = Math.min(.15, (now - previous) / 1000);
  time += elapsed; entrance = Math.min(arrivalDuration, entrance + elapsed); previous = now;
  draw(); timer = setTimeout(tick, 1000 / 15);
};
const sync = () => {
  clearTimeout(timer); timer = 0;
  root.dataset.sceneState = canPlay() ? 'playing' : frame && !noMotion() ? 'paused' : 'still';
  if(noMotion()) { scene.removeAttribute('data-rendered'); if(ctx) { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); } }
  if(canPlay()) { size(); previous = performance.now(); timer = setTimeout(tick, 1000 / 15); }
};
const start = async () => {
  if(frame || loading || noMotion() || !ctx || !inView || document.hidden) return;
  loading = true;
  try {
    const {default:blackHole} = await import('/assets/not-found/black-hole.js?v=ab10ed40363a');
    // Initialization happens after the page has painted; the return link is live.
    frame = blackHole(); size(); sync();
  } catch { /* The static silhouette remains visible if rendering is unavailable. */ }
  finally { loading = false; }
};
const conditionsChanged = () => { sync(); start(); };
reduced.addEventListener('change', conditionsChanged);
contrast.addEventListener('change', conditionsChanged);
document.addEventListener('visibilitychange', conditionsChanged);
new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; conditionsChanged(); }).observe(scene);
new ResizeObserver(size).observe(scene);
new MutationObserver(size).observe(root,{attributes:true,attributeFilter:['data-theme']});
if('requestIdleCallback' in window) requestIdleCallback(start,{timeout:800});
else setTimeout(start,120);
sync();
