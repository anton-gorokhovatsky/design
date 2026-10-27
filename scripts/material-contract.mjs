import postcss from 'postcss';

// Only legacy copies of the unchanged material can use the material cleanup lane.
// Geometry, tokens, and unknown selectors remain outside this scope.
// The exact mobile registry guard below only restores its precedence over legacy
// transparent search states; its container and complete material recipe are fixed.
const legacyOwners = new Set([
  ".map-node-label",
  ".overlay-close",
  ".content-panel__header > div",
  ".content-panel .overlay-close",
  ".content-panel .overlay-close:hover",
  ".content-panel .overlay-close:focus-visible",
  ".content-panel .work-intro, .content-panel .approach-intro, .content-panel .work-row, .content-panel .approach-grid li",
  ".map-hover-preview, .command-results",
  ".map-inspector .overlay-close, .personal-media .overlay-close",
  ".map-inspector .overlay-close:hover, .personal-media .overlay-close:hover",
  ".map-inspector .overlay-close:focus-visible, .personal-media .overlay-close:focus-visible",
  ".command-results",
  ".system-dock .map-controls, .display-control",
  ".command-status",
  ".control-console .command-dock",
  ".system-dock",
  ".map-inspector .map-readout__kind",
  ".map-inspector .map-readout__identity, .map-inspector .map-readout__description",
  ".map-related",
  ".control-console .command-dock:focus-within",
  ".control-console .command-dock.is-open",
  ".map-hover-preview__readout",
  ".map-note button",
  ".settings-panel",
  ".case-sheet",
  ".content-panel__frame",
  ".map-surface.has-command-focus .control-console .mobile-first-dock .command-dock",
  ".project-orbit-tooltip"
]);
const selectorKey = value => value.replace(/\s+/g, ' ').trim();
const materialPaint = node => node.type === 'decl' && (
  node.prop === 'background' && node.value === 'var(--material-01)'
  || /^(?:-webkit-)?backdrop-filter$/.test(node.prop) && node.value === 'blur(24px)');
const mobileRegistry = '@container map-viewport (max-width: 900px){\n[data-material-surface][data-material-active="mobile"]{border:0;background: var(--material-01);box-shadow:none;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);}}';
const guardedMobileRegistry = mobileRegistry.replace('mobile"]', 'mobile"]:not(.is-content-stack-hidden)');
export function isMaterialCleanup(before, after) {
  const addsMobileGuard = before.includes(mobileRegistry) && !before.includes(guardedMobileRegistry)
    && after.includes(guardedMobileRegistry) && !after.includes(mobileRegistry);
  const outside = source => {
    let copies = 0;
    const visit = node => {
      if (node.type === 'comment') return null;
      if (materialPaint(node) && node.parent.type === 'rule' && legacyOwners.has(selectorKey(node.parent.selector))) { copies++; return null; }
      if (node.type === 'decl') return [node.type,node.prop,node.value,!!node.important];
      const children = (node.nodes || []).map(visit).filter(Boolean);
      if (node.nodes && !children.length) return null;
      return [node.type,node.selector || '',node.name || '',node.params || '',children];
    };
    const tree = JSON.stringify(visit(postcss.parse(source)));
    return {tree,copies};
  };
  const a=outside(before),b=outside(addsMobileGuard ? after.replace(guardedMobileRegistry,mobileRegistry) : after);
  return (a.copies>0 || addsMobileGuard) && b.copies===0 && a.tree===b.tree;
}

// Only give the existing system-color fallback priority over the normal registry.
// The media condition, selector, recipe and every other byte must stay unchanged.
export function isMaterialForcedColorsPriority(before, after) {
  const fallback = `[data-material-surface] {
border: 1px solid CanvasText;
background: Canvas;
box-shadow: none;
backdrop-filter: none;
-webkit-backdrop-filter: none;
}`;
  if (before.split(fallback).length !== 2
    || after !== before.replace(fallback, fallback.replaceAll(';', ' !important;'))) return false;
  let scoped = false;
  postcss.parse(before).walkRules('[data-material-surface]', rule => {
    if (rule.toString() === fallback && rule.parent.type === 'atrule'
      && rule.parent.name === 'media' && rule.parent.params === '(forced-colors: active)') scoped = true;
  });
  return scoped;
}

export function independentMaterialPaint(source) {
  const failures=[];
  postcss.parse(source).walkDecls(node=>{
    const surfaceFill=node.prop==='background' && node.value.includes('var(--material-01)');
    const blur=/^(?:-webkit-)?backdrop-filter$/.test(node.prop) && node.value!=='none';
    if (!surfaceFill && !blur) return;
    const selector=node.parent.selector || '';
    if (selector.includes('[data-material-surface][data-material-active=')) return;
    // These are graphic ink and the scroll-edge optical layer, not UI surfaces.
    if (selector==='.origin-marker__cross::after' && surfaceFill) return;
    if (selector==='.scroll-lens-frost' && blur && node.value==='blur(2.2px)') return;
    failures.push({selector,property:node.prop,value:node.value,line:node.source.start.line});
  });
  return failures;
}

// Author-approved Tinted study, 27 October 2026. These values are our CSS
// approximation, not a claimed Apple recipe. Roots own the whole material.
const materialRecipes = {
  ':root': {
    '--material-01': 'rgba(246, 248, 242, 0.4)',
    '--material-01-backdrop': 'blur(24px) saturate(1.35)',
    '--material-01-shadow': 'inset 0 1px 0 rgba(255,255,255,.55), inset 0 0 0 1px rgba(255,255,255,.24), 0 4px 16px rgba(24,30,20,.06)',
    '--origin-cross-fill': 'rgba(255, 255, 255, 0.5)',
  },
  'html[data-theme="dark"]': {
    '--material-01': 'rgba(38, 41, 35, 0.58)',
    '--material-01-backdrop': 'blur(24px) saturate(1.3)',
    '--material-01-shadow': 'inset 0 1px 0 rgba(255,255,255,.16), inset 0 0 0 1px rgba(255,255,255,.055), 0 4px 16px rgba(0,0,0,.14)',
    '--origin-cross-fill': 'rgba(35, 36, 32, 0.5)',
  },
  'html[data-contrast="true"]': {
    '--material-01': 'rgba(255, 255, 255, 0.5)',
    '--material-01-backdrop': 'blur(24px)',
    '--material-01-shadow': 'none',
  },
  'html[data-theme="dark"][data-contrast="true"]': {
    '--material-01': 'rgba(35, 36, 32, 0.5)',
  },
};
const compact = value => value.replace(/\s+/g, '');
const materialToken = property => /^--material-01(?:-backdrop|-shadow)?$/.test(property) || property === '--origin-cross-fill';
const forcedColorsToken = node => ['--material-01', '--origin-cross-fill'].includes(node.prop)
  && node.value === 'Canvas' && !node.important
  && node.parent.selector === '.map-surface,\nhtml[data-theme="dark"]'
  && node.parent.parent.name === 'media' && node.parent.parent.params === '(forced-colors: active)';

export function materialRecipeFailures(source) {
  const failures=[], seen=new Set();
  postcss.parse(source).walkDecls(node => {
    if (!materialToken(node.prop)) return;
    const rule=node.parent, key=rule.selector+' / '+node.prop;
    if (forcedColorsToken(node)) { if (seen.has(key)) failures.push('Duplicate '+key); seen.add(key); return; }
    const expected=rule.parent.type === 'root' && materialRecipes[rule.selector]?.[node.prop];
    if (!expected || compact(node.value)!==compact(expected) || node.important || seen.has(key)) failures.push(key);
    seen.add(key);
  });
  for (const [selector, recipe] of Object.entries(materialRecipes)) {
    for (const property of Object.keys(recipe)) if (!seen.has(selector+' / '+property)) failures.push('Missing '+selector+' / '+property);
  }
  return failures;
}

// Paint-only updates use the existing materials coverage. Keep every selector,
// condition and non-paint declaration in the comparison, including geometry.
export function isMaterialRecipeChange(before, after) {
  const outside = source => {
    const tree=postcss.parse(source), seen=new Set();
    tree.walkDecls(node => {
      const rule=node.parent;
      if (materialToken(node.prop)) {
        if (forcedColorsToken(node)) { node.remove(); return; }
        const expected=rule.parent.type === 'root' && materialRecipes[rule.selector]?.[node.prop];
        const legacy=node.prop === '--material-01' && rule.parent.type === 'root'
          && ((rule.selector === ':root' && compact(node.value)==='rgba(255,255,255,0.5)')
          || (rule.selector === 'html[data-theme="dark"]' && compact(node.value)==='rgba(35,36,32,0.5)'));
        const key=rule.selector+' / '+node.prop;
        if ((!legacy && (!expected || compact(node.value)!==compact(expected))) || node.important || seen.has(key)) throw new Error('Unknown material recipe');
        seen.add(key); node.remove(); return;
      }
      if (rule.selector === '.origin-marker__cross::after' && node.prop === 'background' && node.value === 'var(--origin-cross-fill)' && !node.important) node.value='var(--material-01)';
      if (!rule.selector?.includes('[data-material-surface][data-material-active=')) return;
      const paint={background:['var(--material-01)'], 'box-shadow':['none','var(--material-01-shadow)'], 'backdrop-filter':['blur(24px)','var(--material-01-backdrop)'], '-webkit-backdrop-filter':['blur(24px)','var(--material-01-backdrop)']};
      if (paint[node.prop]?.includes(node.value) && !node.important) node.value='MATERIAL_PAINT';
    });
    const visit=node => node.type === 'comment' ? null : node.type === 'decl'
      ? ['decl',node.prop,node.value,!!node.important]
      : [node.type,node.selector||'',node.name||'',node.params||'',...(node.nodes||[]).map(visit).filter(Boolean)];
    return JSON.stringify(visit(tree));
  };
  try { return before !== after && outside(before) === outside(after); } catch { return false; }
}
