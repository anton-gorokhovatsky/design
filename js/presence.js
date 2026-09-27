// One visible tab per browser reports presence. No cookies or stored identity.
const endpoint = document.querySelector('meta[name="presence-feed"]')?.content;
const views = [...document.querySelectorAll('[data-presence]')];
const id = crypto.randomUUID();
let releaseLock, acquiring = false, timer, busy = false, active = false;
const render = count => views.forEach(view => {
  view.hidden = false;
  view.querySelector('[data-presence-count]').textContent = count === null ? 'Нет связи' : String(count);
});
const report = async () => {
  if (busy || document.hidden || !endpoint) return;
  busy = true;
  try {
    const response = await fetch(endpoint, {
      method: active ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
      ...(active ? { body: JSON.stringify({ id, action: 'beat' }), headers: { 'content-type': 'text/plain' } } : {}),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('Presence unavailable');
    const { count } = await response.json();
    if (!Number.isInteger(count) || count < 0) throw new Error('Invalid count');
    render(count);
  } catch { render(null); }
  finally { busy = false; }
};
const claim = () => {
  if (document.hidden || acquiring || active || !navigator.locks) return report();
  acquiring = true;
  navigator.locks.request('portfolio-presence', { ifAvailable: true }, async lock => {
    acquiring = false;
    if (!lock || document.hidden) return report();
    active = true;
    const held = new Promise(resolve => { releaseLock = resolve; });
    await report();
    await held;
  }).catch(() => { acquiring = false; report(); });
};
const leave = () => {
  if (active) {
    fetch(endpoint, { method: 'POST', credentials: 'omit', keepalive: true, body: JSON.stringify({ id, action: 'leave' }), headers: { 'content-type': 'text/plain' } }).catch(() => {});
  }
  active = false;
  releaseLock?.();
  releaseLock = null;
};
const sync = () => {
  clearInterval(timer);
  if (document.hidden) { leave(); return; }
  claim();
  timer = setInterval(() => { if (active) report(); else claim(); }, 20000);
};
const localPreview = ['localhost', '127.0.0.1'].includes(location.hostname) && endpoint?.startsWith('https:');
if (endpoint && views.length && !localPreview && !new URLSearchParams(location.search).has('og')) {
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { clearInterval(timer); leave(); });
  window.addEventListener('pageshow', sync);
  sync();
}
