import {pane} from './pane-viewport.js';
// Enhance the existing controls after map labels have been created.
import "./map-engine.js";

const initializeMapControls = () => {
  const display = document.querySelector('.display-control');
  const view = document.querySelector('.map-controls');
  if (!display || !view || !('showPopover' in HTMLElement.prototype)) return;
  const desktop = pane.media('(min-width: 901px)');
  const popovers = [];

  const connectDisclosure = id => {
    const panel = document.getElementById(id);
    const trigger = document.getElementById(id + '-trigger');
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const width = panel.offsetWidth || parseFloat(getComputedStyle(panel).width) || 240;
      const left = id === 'screen-controls' ? rect.right - width : rect.left;
      const bottom = id === 'screen-controls' ? display.getBoundingClientRect().bottom : rect.bottom;
      panel.style.maxHeight = Math.max(80, pane.height - 32) + 'px';
      const height = panel.offsetHeight;
      const top = bottom + 8 + height <= pane.height - 16
        ? bottom + 8 : Math.max(16, rect.top - height - 8);
      panel.style.left = Math.max(16, Math.min(left, pane.width - width - 16)) + 'px';
      panel.style.top = top + 'px';
      panel.style.maxHeight = Math.max(80, pane.height - top - 16) + 'px';
    };
    panel.addEventListener('beforetoggle', event => { if (event.newState === 'open') place(); });
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !panel.matches(':popover-open')) return;
      event.preventDefault();
      event.stopPropagation();
      panel.hidePopover();
      trigger.focus({ preventScroll: true });
    }, true);
    panel.addEventListener('toggle', event => {
      trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
      if (event.newState === 'open') place();
    });
    panel.querySelector('.map-popover__close').addEventListener('click', () => trigger.focus({ preventScroll: true }));
    window.addEventListener('resize', place);
    popovers.push(panel);
    return { trigger, panel };
  };

  connectDisclosure('screen-controls');
  connectDisclosure('map-about');

  for (const id of ['garage', 'private-practice', 'running']) {
    const label = document.querySelector('[data-map-label-id="' + id + '"]');
    const node = document.querySelector('[data-map-id="' + id + '"]');
    if (!label || !node) continue;
    label.classList.add('map-anchor-label');
    const sync = () => label.classList.toggle('map-anchor-hidden', node.inert || node.getAttribute('aria-hidden') === 'true');
    new MutationObserver(sync).observe(node, { attributes: true, attributeFilter: ['class', 'inert', 'aria-hidden'] });
    sync();
  }

  const closePopovers = () => popovers.forEach(panel => { if (panel.matches(':popover-open')) panel.hidePopover(); });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-settings], [data-open-panel], [data-nav-view], [data-map-id]')) closePopovers();
  });
  desktop.addEventListener('change', closePopovers);
  window.addEventListener('reading-surface-change', closePopovers);
  document.documentElement.dataset.mapControlsReady = 'true';
  window.dispatchEvent(new Event('resize'));
};

initializeMapControls();
