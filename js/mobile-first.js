const compact = matchMedia('(max-width: 900px)');
const dock = document.querySelector('.mobile-first-dock');
const composition = document.querySelector('.system-dock');
const toggle = document.querySelector('[data-mobile-composition]');
const close = document.querySelector('[data-mobile-composition-close]');
function setComposition(open, restoreFocus = false) {
  document.body.classList.toggle('has-mobile-composition', open);
  toggle.setAttribute('aria-expanded', String(open));
  composition.inert = compact.matches && !open;
  if (restoreFocus) toggle.focus({ preventScroll: true });
}
toggle.addEventListener('click', () => setComposition(toggle.getAttribute('aria-expanded') !== 'true'));
close.addEventListener('click', () => setComposition(false, true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
    event.stopImmediatePropagation();
    setComposition(false, true);
  }
}, true);
document.addEventListener('pointerdown', event => {
  if (!composition.contains(event.target) && !toggle.contains(event.target)) setComposition(false);
});
window.addEventListener('reading-surface-change', () => setComposition(false));
compact.addEventListener('change', () => setComposition(false));
setComposition(false);

let height = 0;
new ResizeObserver(() => {
  const next = Math.ceil(dock.getBoundingClientRect().height);
  if (next === height) return;
  height = next;
  document.documentElement.style.setProperty('--mobile-first-dock-height', `${height}px`);
  window.dispatchEvent(new Event('resize'));
}).observe(dock);
