import postcss from 'postcss';

// Only legacy copies of the unchanged material can use the material cleanup lane.
// Geometry, tokens, the registry, and unknown selectors remain outside this scope.
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
export function isMaterialCleanup(before, after) {
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
  const a=outside(before),b=outside(after);
  return a.copies>0 && b.copies===0 && a.tree===b.tree;
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
