import assert from "node:assert/strict";

// Inspect the text that is actually painted, including inherited opacity and
// clipping by scrolling windows. The screenshot supplies the composited glass,
// gradients, canvas and day colour; a CSS background token cannot substitute it.
export async function measureTextContrast(page) {
  const samples = await page.evaluate(() => {
    const samples = [], parents = new Map();
    const selector = element => element.id ? '#' + CSS.escape(element.id)
      : element === document.body ? 'body'
        : selector(element.parentElement) + ' > ' + element.tagName.toLowerCase()
          + ':nth-child(' + ([...element.parentElement.children].indexOf(element) + 1) + ')';
    // The dimmed, inactive page behind a modal is not the current reading task.
    const modal = [...document.querySelectorAll('[aria-modal="true"]')]
      .find(element => element.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
    const walker = document.createTreeWalker(modal || document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, element = node.parentElement;
      if (!node.textContent.trim() || !element?.checkVisibility({ visibilityProperty: true, opacityProperty: true })
        || element.closest('script,style,noscript,[inert],:disabled,.visually-hidden')) continue;
      const style = getComputedStyle(element), range = document.createRange();
      range.selectNodeContents(node);
      let opacity = 1, left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect();
        opacity *= Number(css.opacity);
        if (/(hidden|clip|auto|scroll)/.test(css.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
        if (/(hidden|clip|auto|scroll)/.test(css.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
      }
      if (opacity < .01) continue;
      const points = [];
      for (const rect of range.getClientRects()) {
        const x1 = Math.max(left, rect.left), x2 = Math.min(right, rect.right);
        const y1 = Math.max(top, rect.top), y2 = Math.min(bottom, rect.bottom);
        if (x2 - x1 < 2 || y2 - y1 < 2) continue;
        for (const x of [.2, .5, .8]) for (const y of [.25, .5, .75]) {
          const point = [x1 + (x2 - x1) * x, y1 + (y2 - y1) * y];
          const hit = document.elementFromPoint(...point);
          // Labels over the map intentionally have pointer-events:none.
          if (style.pointerEvents === 'none' || element.contains(hit) || hit?.contains(element)) points.push(point);
        }
      }
      if (!points.length) continue;
      if (!parents.has(element)) { parents.set(element, parents.size); element.dataset.auditHideInk = ''; }
      const size = parseFloat(style.fontSize), weight = parseFloat(style.fontWeight);
      samples.push({ target: selector(element), text: node.textContent.trim(), color: style.color, opacity, points,
        required: size >= 24 || (weight >= 700 && size >= 18.667) ? 3 : 4.5 });
    }
    for (const element of (modal || document.body).querySelectorAll('input,textarea')) {
      const text = element.value || element.placeholder;
      if (!text || element.disabled || element.closest('[inert]')
        || !element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const box = getComputedStyle(element), style = element.value ? box : getComputedStyle(element, '::placeholder');
      const rect = element.getBoundingClientRect(), points = [];
      let opacity = element.value ? 1 : Number(style.opacity);
      for (let e = element; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      context.font = box.font;
      const left = rect.left + parseFloat(box.paddingLeft), width = Math.min(context.measureText(text).width,
        rect.width - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight));
      for (const fraction of [.2,.5,.8]) {
        const point = [left + width * fraction, rect.top + rect.height / 2];
        if (document.elementFromPoint(...point) === element) points.push(point);
      }
      if (!points.length) continue;
      element.dataset.auditHideInk = '';
      samples.push({ target: selector(element), text, color: style.color, opacity, points,
        required: parseFloat(box.fontSize) >= 24 ? 3 : 4.5 });
    }
    return samples;
  });
  const conceal = await page.addStyleTag({ content: '[data-audit-hide-ink] { transition: none !important; } html[data-audit-no-ink] [data-audit-hide-ink], html[data-audit-no-ink] [data-audit-hide-ink]::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' });
  await page.evaluate(() => { document.documentElement.dataset.auditNoInk = ''; });
  let pixels;
  try { pixels = (await page.screenshot()).toString('base64'); }
  finally {
    await page.evaluate(async () => {
      delete document.documentElement.dataset.auditNoInk;
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await conceal.evaluate(e => e.remove());
    await page.evaluate(() => document.querySelectorAll('[data-audit-hide-ink]').forEach(e => e.removeAttribute('data-audit-hide-ink')));
  }
  return page.evaluate(async ({ samples, pixels }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + pixels; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const swatch = document.createElement('canvas'); swatch.width = swatch.height = 1;
    const paint = swatch.getContext('2d');
    const scale = image.width / innerWidth;
    const luminance = rgb => rgb.map(value => {
      value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    return samples.map(({ points, color, opacity, ...sample }) => {
      // Let the browser convert CSS Color 4 / color-mix() to sRGB as well as rgb().
      paint.clearRect(0,0,1,1); paint.fillStyle = color; paint.fillRect(0,0,1,1);
      const rgba = [...paint.getImageData(0,0,1,1).data], alpha = opacity * rgba[3] / 255;
      const ratios = points.map(([x,y]) => {
        const background = [...context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data].slice(0,3);
        const foreground = rgba.slice(0,3).map((v,i) => v * alpha + background[i] * (1-alpha));
        const a = luminance(foreground), b = luminance(background);
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });
      return { ...sample, minimum: Math.min(...ratios), samples: points.length };
    });
  }, { samples, pixels });
}

export function assertTextContrast(samples, name) {
  assert.ok(samples.length > 0, `${name}: painted text must be measured`);
  assert.deepEqual(samples.filter(item => item.minimum < item.required), [], `Rendered text contrast: ${name}`);
}

// Do not discard axe's incomplete results. Each node retains its selectors and
// checks, plus a mechanically verified resolution; new unknown cases fail CI.
export async function reviewIncomplete(page, incomplete, contrast) {
  return page.evaluate(({ incomplete, contrast }) => incomplete.flatMap(rule => rule.nodes.map(node => {
    const element = node.target.length === 1 ? document.querySelector(node.target[0]) : null;
    let resolution = null;
    if (element && rule.id === 'color-contrast') {
      const measured = contrast.filter(sample => element.contains(document.querySelector(sample.target)));
      if (measured.length && measured.every(sample => sample.minimum >= sample.required)) {
        resolution = 'This element’s painted text passed the composited-background contrast measurement.';
      } else {
        const r = element.getBoundingClientRect();
        let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect();
          if (/(hidden|clip|auto|scroll)/.test(css.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
          if (/(hidden|clip|auto|scroll)/.test(css.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
        }
        const textRects = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(walker.currentNode);
          textRects.push(...range.getClientRects());
        }
        const clipped = (textRects.length ? textRects : [...element.getClientRects()]).every(rect =>
          Math.min(rect.bottom, bottom) - Math.max(rect.top, top) < 2
          || Math.min(rect.right, right) - Math.max(rect.left, left) < 2);
        if (!r.width || !r.height || clipped) resolution = 'Outside this viewport sample; no contrast verdict until scrolled into view.';
      }
    }
    if (element && rule.id === 'aria-valid-attr-value'
      && [...node.any, ...node.all, ...node.none].every(check => check.data?.messageKey === 'controlsWithinPopup')) {
      const ids = element.getAttribute('aria-controls')?.trim().split(/\s+/) || [];
      if (ids.length && ids.every(id => {
        const popup = document.getElementById(id);
        return popup && ['dialog','listbox'].includes(popup.getAttribute('role'));
      })) resolution = 'The controlled popup exists with its expected role; it is hidden until opened.';
    }
    if (element && rule.id === 'video-caption' && element.matches('.case-media video') && element.muted) {
      resolution = 'Registered silent site fragment: the case text and figures carry the information; media gate verifies that reels have no audio stream.';
    }
    if (element?.matches('[data-map-id]') && rule.id === 'target-size') {
      const r = element.getBoundingClientRect();
      const ownsSquare = r.width >= 24 && r.height >= 24 && [-11.9,0,11.9].every(dx =>
        [-11.9,0,11.9].every(dy => element.contains(document.elementFromPoint(r.x+r.width/2+dx,r.y+r.height/2+dy))));
      if (ownsSquare) resolution = 'A real 24px square belongs to this point; negative tabindex is roving keyboard focus, not a noninteractive neighbour.';
    }
    return { rule: rule.id, target: node.target, html: node.html,
      checks: [...node.any, ...node.all, ...node.none], resolution };
  })), { incomplete, contrast });
}

// Check a real, unobscured 24px square, not only CSS width or a clickable centre.
export async function readMapTargets(page) {
  return page.locator('[data-map-nodes] button').evaluateAll(elements => elements
    .filter(e => e.checkVisibility({ visibilityProperty:true, opacityProperty:true }) && !e.closest('[inert]'))
    .map(e => {
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const misses = [];
      for (const dx of [-11.9, -6, 0, 6, 11.9]) for (const dy of [-11.9, -6, 0, 6, 11.9]) {
        if (!e.contains(document.elementFromPoint(x+dx,y+dy))) misses.push([dx,dy]);
      }
      return { id:e.dataset.mapId, width:r.width, height:r.height, misses };
    }));
}
