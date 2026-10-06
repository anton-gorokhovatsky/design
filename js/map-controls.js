// Enhance the existing controls after map labels have been created.
import "./map-engine.js";

const initializeMapControls = () => {
  const display = document.querySelector('.display-control');
  const view = document.querySelector('.map-controls');
  if (!display || !view || !('showPopover' in HTMLElement.prototype)) return;
  const desktop = matchMedia('(min-width: 901px)');
  const closeIcon = '<svg class="ui-close__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7 17 17M17 7 7 17"/></svg>';
  const chevron = '<svg class="map-disclosure__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  const popovers = [];

  const createDisclosure = (id, title, host) => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'map-disclosure';
    trigger.setAttribute('popovertarget', id);
    trigger.setAttribute('aria-controls', id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span>' + title + '</span>' + chevron;
    const panel = document.createElement('div');
    panel.id = id;
    panel.popover = 'auto';
    panel.className = 'map-popover';
    panel.dataset.materialSurface = id;
    panel.dataset.materialActive = 'desktop';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', id + '-title');
    panel.innerHTML = '<div class="map-popover__header"><h2 id="' + id + '-title">' + title + '</h2><button class="ui-close map-popover__close" type="button" aria-label="Закрыть" popovertarget="' + id + '" popovertargetaction="hide">' + closeIcon + '</button></div>';
    host.append(panel);
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const width = panel.offsetWidth || parseFloat(getComputedStyle(panel).width) || 240;
      const left = id === 'screen-controls' ? rect.right - width : rect.left;
      const bottom = id === 'screen-controls' ? display.getBoundingClientRect().bottom : rect.bottom;
      const top = Math.min(bottom + 8, innerHeight - 100);
      panel.style.left = Math.max(16, Math.min(left, innerWidth - width - 16)) + 'px';
      panel.style.top = top + 'px';
      panel.style.maxHeight = Math.max(80, innerHeight - top - 16) + 'px';
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

  const meta = display.querySelector('.map-meta');
  const theme = display.querySelector('.theme-toggle');
  const service = display.querySelector('.display-control__service');
  const note = service.querySelector('[data-map-note]');
  const screen = createDisclosure('screen-controls', 'ЭКРАН', display);
  const top = document.createElement('div');
  top.className = 'map-screen-top';
  top.append(meta, screen.trigger);
  display.prepend(top);
  screen.panel.append(theme, service);
  display.dataset.materialActive = 'none';
  view.dataset.materialActive = 'none';

  const about = createDisclosure('map-about', 'О КАРТЕ', view);
  about.trigger.classList.add('map-about-trigger');
  view.append(about.trigger);
  about.panel.append(note);

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
    if (event.target.closest('[data-open-settings], [data-nav-view], [data-map-id]')) closePopovers();
  });
  desktop.addEventListener('change', closePopovers);
  window.addEventListener('reading-surface-change', closePopovers);
  document.documentElement.dataset.mapControlsReady = 'true';
  window.dispatchEvent(new Event('resize'));
};

initializeMapControls();
