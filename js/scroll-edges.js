// Reading surfaces only. Their stationary shells keep the shared glass material.
// Search, menus and compact action popovers deliberately keep a crisp edge.
const readers = '.content-panel__body,.case-scroll,.settings-panel__body,#story-pane,.project-orbit-picker';
const controllers = new WeakMap();

function observeReader(region) {
  if (controllers.has(region)) {
    controllers.get(region)();
    return;
  }
  region.dataset.scrollEdge = '';
  let frame = 0;
  let children = new Set();
  const setDepth = (side, value) => {
    const name = `--scroll-edge-${side}`, next = `${value.toFixed(2)}px`;
    if (region.style.getPropertyValue(name) !== next) region.style.setProperty(name, next);
  };
  const update = () => {
    frame = 0;
    const height = region.clientHeight;
    const maximum = height > 0 ? Math.max(0, region.scrollHeight - height) : 0;
    // Clamp fractional positions and Safari's elastic overscroll to the real range.
    const top = Math.max(0, Math.min(maximum, region.scrollTop));
    const depth = Math.min(parseFloat(getComputedStyle(region).getPropertyValue('--scroll-edge-depth')) || 0, height / 4);
    const active = maximum > 1;
    const next = String(active);
    if (region.dataset.scrollEdgeActive !== next) region.dataset.scrollEdgeActive = next;
    setDepth('top', active && top > 1 ? Math.min(depth, top) : 0);
    setDepth('bottom', active && maximum - top > 1 ? Math.min(depth, maximum - top) : 0);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  controllers.set(region, schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  const syncChildren = () => {
    for (const child of children) if (child.parentElement !== region) resize.unobserve(child);
    const next = new Set(region.children);
    for (const child of next) if (!children.has(child)) resize.observe(child);
    children = next;
    schedule();
  };
  // Case copy, disclosure content and the story arrive after the reader exists.
  new MutationObserver(syncChildren).observe(region, { childList: true, subtree: true, characterData: true });
  region.addEventListener('scroll', schedule, { passive: true });
  region.addEventListener('load', schedule, true);
  syncChildren();
}

function discover(root) {
  if (!(root instanceof Element || root instanceof Document)) return;
  if (root instanceof Element && root.matches(readers)) observeReader(root);
  root.querySelectorAll(readers).forEach(observeReader);
}

discover(document);
// Readers such as case-scroll and the project picker are mounted on demand.
// Observe insertions only, never the map's per-frame style/position mutations.
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) discover(node);
}).observe(document.body, { childList: true, subtree: true });
