// Enhance the existing controls after map labels have been created.
import "./map-engine.js";

const initializeMapControls = () => {
  for (const id of ['garage', 'private-practice', 'running']) {
    const label = document.querySelector('[data-map-label-id="' + id + '"]');
    const node = document.querySelector('[data-map-id="' + id + '"]');
    if (!label || !node) continue;
    label.classList.add('map-anchor-label');
    const sync = () => label.classList.toggle('map-anchor-hidden', node.inert || node.getAttribute('aria-hidden') === 'true');
    new MutationObserver(sync).observe(node, { attributes: true, attributeFilter: ['class', 'inert', 'aria-hidden'] });
    sync();
  }

  document.documentElement.dataset.mapControlsReady = 'true';
  window.dispatchEvent(new Event('resize'));
};

initializeMapControls();
