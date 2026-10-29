import postcss from "postcss";
import { createHash } from "node:crypto";
import { isMaterialCleanup, isMaterialForcedColorsPriority, isMaterialRecipeChange } from "./material-contract.mjs";
import { overviewOutside, overviewHtmlOutside, notFoundBindings } from "./overview-scope.mjs";
import selectorParser from "postcss-selector-parser";
import { parse as parseHtml } from "parse5";
import { parse as parseJs } from "acorn";

// A positive component root must own every selector branch. References inside
// :is/:has/:not do not establish ownership; siblings outside the root stay full.
const settingsClass = /^settings-(?:panel|whoop|presence)(?:$|__|--)/;
const ownsClass = (matches) => (selector) => selectorParser().astSync(selector).nodes.every((branch) => {
  let owned = false;
  for (const node of branch.nodes) {
    if (node.type === "class" && matches.test(node.value)) owned = true;
    // A sibling of the root or a :has/:is reference is not its descendant.
    if (node.type === "combinator" && !["", ">"].includes(node.value.trim())) return false;
    if (node.type === "nesting") return false;
  }
  return owned;
});
// This sibling pair is inside the related list; arbitrary siblings stay unowned.
const ownsRelatedRow = selector => selector.trim() === ".map-related__track > li + li";
const cssOwners = {
  "check:hover-layout": selector => selector.trim() === '.project-orbit-picker [data-picker-project="dd-camp"] .project-atlas-mark',
  "map-story": selector => selectorParser().astSync(selector).nodes.every(branch =>
    branch.nodes.some(node => node.type === "id" && node.value === "story-pane")
    && branch.nodes.every(node => node.type !== "nesting"
      && (node.type !== "combinator" || ["", ">"].includes(node.value.trim())))),
  "story-bridge": selector => selectorParser().astSync(selector).nodes.every(branch =>
    branch.nodes.some(node => node.type === "id" && node.value === "story-bridge")
    && branch.nodes.every(node => node.type !== "nesting"
      && (node.type !== "combinator" || ["", ">"].includes(node.value.trim())))),
  settings: selector => !ownsClass(/^settings-panel__version$/)(selector) && ownsClass(settingsClass)(selector),
  "check:accessibility": ownsClass(/^(?:site-version(?:--[\w-]+)?|settings-panel__version|display-control__(?:presence|status)|map-about-trigger(?:__[\w-]+)?|map-control-group--secondary|nav-external|contact-links|map-readout__destination)$/),
  consent: ownsClass(/^analytics-notice(?:$|__)/),
  overview: ownsClass(/^(?:overview-entry|work-overview(?:__[\w-]+)?|observation-[\w-]+)$/),
  "map-presentation": selector => selectorParser().astSync(selector).nodes.every(branch =>
    branch.nodes[0]?.type === "class" && /^map-node(?:$|__|--)/.test(branch.nodes[0].value))
    && ownsClass(/^map-node(?:$|__|--)/)(selector),
  header: ownsClass(/^(?:focused-return(?:__[\w-]+)?|site-header|brand(?:__[\w-]+)?|whoop-(?:readout|metrics|status|foot|stamp|level|compact-trigger))$/),
  "search-icon": ownsClass(/^command-dock__mark$/),
  "check:command-placement": ownsClass(/^(?:has-command-focus|command-dock__submit-mark)$/),
  "check:inspector-links": selector => ownsRelatedRow(selector) || ownsClass(/^(?:nav-external|contact-links|map-readout__destination|map-related(?:__[\w-]+)?|map-evidence)$/)(selector),
  "check:case-view": selector => ownsRelatedRow(selector) || ownsClass(/^(?:map-related(?:__[\w-]+)?|map-evidence)$/)(selector),
  "map-labels": ownsClass(/^map-(?:node-label|anchor-label|space-label)(?:$|--)/),
};

const cssOutsideOwned = (source, owns) => {
  const visit = (node) => {
    if (node.type === "comment") return null;
    if (node.type === "rule" && node.nodes.every((child) => ["decl", "comment"].includes(child.type))
      && owns(node.selector)) return null;
    if (node.type === "root" || (node.type === "atrule" && ["media", "supports", "container"].includes(node.name))) {
      const children = (node.nodes || []).map(visit).filter(Boolean);
      // Empty conditional groups have no effect. Other at-rules (@layer,
      // @property, @font-face, keyframes, imports) must be byte-identical.
      return children.length ? [node.type, node.name, node.params, children] : null;
    }
    return node.toString();
  };
  return JSON.stringify(visit(postcss.parse(source)));
};

// Only the exact pointer-lifetime guard may use this existing reading-surface coverage.
const lensPointerGuardPatch = [
  [
    [
      "  const records = new Map();\n  let frame = 0;",
      "  const records = new Map();\n  const pressedPointers = new Set();\n  let frame = 0;"
    ],
    [
      "    region.style.removeProperty(\"--scroll-ink-filter\");\n    if (region.parentElement !== textFrame)",
      "    region.style.removeProperty(\"--scroll-ink-filter\");\n    if (pressedPointers.size) return;\n    if (region.parentElement !== textFrame)"
    ],
    [
      "      if (!textFrame && !region.querySelector(\"iframe\")) {\n        const style=getComputedStyle(region);",
      "      if (!textFrame && !region.querySelector(\"iframe\")) {\n        if (pressedPointers.size) return;\n        const style=getComputedStyle(region);"
    ],
    [
      "  region.addEventListener(\"focusin\", schedule);\n  region.addEventListener(\"focusout\", schedule);",
      "  // WebKit cancels click if the pressed control is reparented before pointerup.\n  region.addEventListener(\"pointerdown\", event => pressedPointers.add(event.pointerId), { capture: true, passive: true });\n  const releasePointer = event => { if (pressedPointers.delete(event.pointerId)) schedule(); };\n  window.addEventListener(\"pointerup\", releasePointer, { capture: true, passive: true });\n  window.addEventListener(\"pointercancel\", releasePointer, { capture: true, passive: true });\n  const releasePointers = () => { if (pressedPointers.size) { pressedPointers.clear(); schedule(); } };\n  window.addEventListener(\"blur\", releasePointers);\n  window.addEventListener(\"pagehide\", releasePointers);\n  region.addEventListener(\"focusin\", schedule);\n  region.addEventListener(\"focusout\", schedule);"
    ]
  ],
  [
    [
      "const h=new Map;let p,f,g,y,b=0;",
      "const h=new Map,pressedPointers=new Set;let p,f,g,y,b=0;"
    ],
    [
      "M=()=>{if(f)if(r.style.removeProperty(\"--scroll-ink-filter\"),r.parentElement===f)r.querySelector(\"iframe\")||w(()=>{v(f.parentElement,f),f.remove(),f=null;for(const[e,t]of y)r.style[e]=t});else{f.remove(),f=null;for(const[e,t]of y)r.style[e]=t}}",
      "M=()=>{if(!f)return;r.style.removeProperty(\"--scroll-ink-filter\");if(pressedPointers.size)return;if(r.parentElement===f){r.querySelector(\"iframe\")||w(()=>{v(f.parentElement,f),f.remove(),f=null;for(const[e,t]of y)r.style[e]=t})}else{f.remove(),f=null;for(const[e,t]of y)r.style[e]=t}}"
    ],
    [
      "if(!f&&!r.querySelector(\"iframe\")){const e=getComputedStyle(r);",
      "if(!f&&!r.querySelector(\"iframe\")){if(pressedPointers.size)return;const e=getComputedStyle(r);"
    ],
    [
      "},$=new ResizeObserver(E);",
      "},$=new ResizeObserver(E),releasePointer=e=>{pressedPointers.delete(e.pointerId)&&E()},releasePointers=()=>{if(pressedPointers.size){pressedPointers.clear();E()}};"
    ],
    [
      "r.addEventListener(\"focusin\",E),r.addEventListener(\"focusout\",E)",
      "r.addEventListener(\"pointerdown\",e=>pressedPointers.add(e.pointerId),{capture:true,passive:true}),window.addEventListener(\"pointerup\",releasePointer,{capture:true,passive:true}),window.addEventListener(\"pointercancel\",releasePointer,{capture:true,passive:true}),window.addEventListener(\"blur\",releasePointers),window.addEventListener(\"pagehide\",releasePointers),r.addEventListener(\"focusin\",E),r.addEventListener(\"focusout\",E)"
    ]
  ]
];
const isLensPointerGuard = (before, after) => lensPointerGuardPatch.some(patches => {
  let restored = after;
  for (const [old, guarded] of patches) {
    if (!before.includes(old) || before.includes(guarded) || restored.split(guarded).length !== 2) return false;
    restored = restored.replace(guarded, old);
  }
  return restored === before;
});

// Exact migration of separator roles; other geometry and shared tokens stay protected.
const separatorTokens = {
  "--separator-rule": "1px solid var(--line-soft)",
  "--separator-edge": "1px solid var(--line)",
  "--separator-control-before": "var(--space-2)",
  "--separator-control-after": "0px",
  "--separator-row-compact": "var(--space-3)",
  "--separator-row-regular": "var(--space-4)",
  "--separator-row-roomy": "var(--space-5)",
  "--separator-section-before": "var(--space-5)",
  "--separator-section-after": "var(--space-4)"
};
const separatorDeclarations = [
  [".map-related__track > li + li", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".map-related__item", "", "padding", "12px 0", "var(--separator-row-compact) 0"],
  [".map-evidence", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".map-evidence", "", "margin", "13px 0 0", "var(--separator-section-before) 0 0"],
  [".map-evidence", "", "padding", "12px 0 14px", "var(--separator-section-after) 0 0"],
  [".map-evidence", "@container map-viewport (max-width: 900px)", "padding", "10px 0 10px", "var(--separator-section-after) 0 0"],
  [".map-evidence", "@container map-viewport (max-width: 900px)", "margin-top", "11px", "var(--separator-section-before)"],
  [".contact-links", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".contact-links a", "", "border-bottom", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".contact-links a", "", "padding-block", "var(--space-4)", "var(--separator-row-regular)"],
  [".constellation-nav__utilities", "@container map-viewport (max-width: 900px)", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".constellation-nav__utilities", "@container map-viewport (max-width: 900px)", "padding-top", "var(--space-2)", "var(--separator-control-after)"],
  [".constellation-nav__utilities", "@container map-viewport (max-width: 900px)", "margin", "var(--space-2) 8px 0", "var(--separator-control-before) 8px 0"],
  [".no-script-fallback nav", "", "border-top", "1px solid var(--line)", "var(--separator-edge)"],
  [".no-script-fallback nav a,\n.no-script-fallback__contacts a", "", "border-bottom", "1px solid var(--line)", "var(--separator-edge)"],
  [".content-panel .content-panel__frame .approach-grid li", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".content-panel .content-panel__frame .approach-grid li", "", "padding", "var(--space-5) 0", "var(--separator-row-roomy) 0"],
  [".is-case-view .map-related", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".is-case-view .map-related", "", "padding", "var(--case-space-section) 0 0", "var(--separator-section-after) 0 0"],
  [".is-case-view .map-evidence", "", "margin-top", "var(--case-space-section)", "var(--separator-section-before)"],
  [".is-case-view .map-evidence", "", "padding", "var(--case-space-section) 0 0", "var(--separator-section-after) 0 0"],
  [".case-details", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".case-details", "", "margin-top", "var(--case-space-section)", "var(--separator-section-before)"],
  [".case-details", "", "padding-top", "var(--case-space-section)", "var(--separator-section-after)"],
  [".case-details__technical", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".case-details__technical", "", "padding-top", "var(--case-space-section)", "var(--separator-section-after)"],
  [".has-reading-frame .case-story > .map-related", "", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".has-reading-frame .case-story > .map-related", "", "padding", "16px 0 0", "var(--separator-section-after) 0 0"],
  [".control-console .command-dock", "@container map-viewport (min-width: 901px)", "border-bottom", "1px solid var(--line)", "var(--separator-edge)"],
  [".system-dock .map-controls,\n.display-control", "@container map-viewport (min-width: 901px)", "border-top", "1px solid var(--line)", "var(--separator-edge)"],
  [".map-control-group--coordinates", "@container map-viewport (min-width: 901px)", "border-top", "1px solid var(--line-soft)", "var(--separator-rule)"],
  [".map-control-group--coordinates", "@container map-viewport (min-width: 901px)", "padding-top", "var(--space-2)", "var(--separator-control-after)"],
  [".map-control-group--coordinates", "@container map-viewport (min-width: 901px)", "margin-top", "var(--space-2)", "0px"],
  [".system-dock .map-controls", "@container map-viewport (min-width: 901px)", "gap", "var(--space-2)", "var(--separator-control-before)"],
];
const separatorLocalBindings = [
  ['.map-surface', '@media (prefers-contrast: more)', '--separator-rule'],
  ['.map-surface', '@media (prefers-contrast: more)', '--separator-edge'],
  ['.no-script-fallback', '@media (prefers-color-scheme: dark)', '--separator-edge'],
];
const separatorCss = source => {
  const tree = postcss.parse(source); const tokens = new Set(); const localBindings = new Set();
  tree.walkDecls(declaration => {
    const rule = declaration.parent;
    const contexts = []; for (let p = rule.parent; p.type === 'atrule'; p = p.parent) contexts.unshift('@' + p.name + ' ' + p.params);
    if (Object.hasOwn(separatorTokens, declaration.prop)) {
      if (rule.type !== 'rule' || declaration.value !== separatorTokens[declaration.prop]
          || declaration.important) throw new Error('Unknown separator token');
      const rootToken = rule.selector === ':root' && rule.parent.type === 'root';
      const localBinding = separatorLocalBindings.some(([selector, context, prop]) =>
        rule.selector === selector && contexts.join(' / ') === context && declaration.prop === prop);
      if (!rootToken && !localBinding) throw new Error('Unknown separator binding');
      const seen = rootToken ? tokens : localBindings;
      const key = rootToken ? declaration.prop : [rule.selector, ...contexts, declaration.prop].join(' / ');
      if (seen.has(key)) throw new Error('Duplicate separator token');
      seen.add(key); declaration.remove(); return;
    }
    if (rule.type !== 'rule') return;
    const patch = separatorDeclarations.find(([selector, context, prop, , value]) =>
      rule.selector === selector && contexts.join(' / ') === context && declaration.prop === prop && declaration.value === value);
    if (patch) declaration.value = patch[3];
  });
  if (tokens.size !== 0 && tokens.size !== Object.keys(separatorTokens).length) throw new Error('Incomplete separator roles');
  if (source.includes('var(--separator-') && tokens.size !== Object.keys(separatorTokens).length) throw new Error('Missing separator roles');
  const serialize = node => node.type === 'comment' ? null
    : node.type === 'decl' ? [node.type, node.prop, node.value, !!node.important]
      : [node.type, node.selector || '', node.name || '', node.params || '', (node.nodes || []).map(serialize).filter(Boolean)];
  return JSON.stringify(serialize(tree));
};
const isSeparatorUpdate = (before, after) => {
  try { return separatorCss(before) === separatorCss(after); } catch { return false; }
};

// This footer adjustment changes only the compact menu's trailing space.
const menuFooterCss = source => {
  const tree = postcss.parse(source);
  tree.walkRules('.control-console .constellation-nav.is-open .constellation-nav__orbit', rule => {
    const parent = rule.parent;
    if (parent.type !== 'atrule' || parent.name !== 'container'
        || parent.params !== 'map-viewport (max-width: 900px)' || parent.parent.type !== 'root') return;
    rule.walkDecls('padding', declaration => {
      if (declaration.value === '0 8px var(--space-4)' && !declaration.important) declaration.value = '0 8px 4px';
    });
  });
  return cssOutsideOwned(tree.toString(), ownsClass(/^site-version--menu$/));
};
const isMenuFooterSpacing = (before, after) => {
  try { return menuFooterCss(before) === menuFooterCss(after); } catch { return false; }
};

// Exact presentation migration: the map stays undimmed below compact overlays,
// while the picker clips one shared outer contour. Other declarations stay owned
// by their existing component or require full coverage.
const surfacePresentationRules = [
  [["@container map-viewport (max-width: 900px)"],'.content-panel[data-view="work"]',{"--panel-bottom":["var(--window-edge)"]},["check:first-visit"]],
  [["@container map-viewport (min-width:901px)"],".content-panel img.work-row__preview",{"width":["min(100%,20rem,30cqh)","min(100%,22rem,35cqh)"]},["check:first-visit"]],
  [[],".map-surface:is(.has-constellation-nav,.has-command-focus) :is(.site-header,.whoop-field)",{"opacity":[".16"],"filter":["blur(3px)"],"pointer-events":["none"]},["check:header","check:command-placement","check:accessibility"]],
  [["@container map-viewport (max-width: 900px)"],".map-surface.has-constellation-nav .mobile-first-dock",{"opacity":[".4"]},["check:header","check:command-placement","check:accessibility"]],
  [["@container map-viewport (max-width: 900px)"],".map-surface.has-focused-home.has-constellation-nav .focused-home",{"opacity":[".48"],"transform":["translateY(4px) scale(.97)"]},["check:header","check:command-placement","check:accessibility"]],
  [["@container map-viewport (max-width: 900px)"],".map-surface.has-focused-home.has-constellation-nav .focused-home .site-header",{"opacity":["1"],"filter":["none"]},["check:header","check:command-placement","check:accessibility"]],
  [["@container map-viewport (max-width: 900px)"],".map-surface.has-full-mobile-map.has-constellation-nav :is(.map-camera,.map-labels,.focused-return)",{"opacity":[".45"],"pointer-events":["none"]},["check:header","check:command-placement","check:accessibility"]],
  [[],".point-preview.is-project-picker>.point-preview__head",{"z-index":["2","3"]},["check:hover-layout"]],
  [[],".point-preview.is-project-picker>.point-preview__close",{"z-index":["3","4"]},["check:hover-layout"]],
  [[],".project-picker-glass",{"inset":["var(--picker-head-height) 0 0","calc(-1 * var(--picker-head-height)) 0 0"],"z-index":["0"],"border-radius":["0 0 var(--window-radius) var(--window-radius)","var(--window-radius)"],"clip-path":["border-box"]},["check:hover-layout"]],
  [["@media (max-width:999px)"],".story-menu-open #story-pane",{"opacity":[".45"]},["map-story"]],
  [["@media (max-width:999px)"],".story-menu-open :is(#split-shell>#story-pane,[data-scroll-lens-frame]:has(>#story-pane))",{"filter":["blur(3px)"]},["map-story"]],
  [["@container map-viewport (max-width: 900px)"],".map-surface.has-constellation-nav :is(.site-header,.whoop-field)",{"filter":["none"],"pointer-events":["none"]},["check:header","check:command-placement","check:accessibility"]],
  [["@container map-viewport (max-width: 900px)"],".map-surface.has-constellation-nav :is(.map-camera,.map-labels,.focused-return)",{"opacity":["1"],"pointer-events":["none"]},["check:header","check:command-placement","check:accessibility"]],
  [[],".project-picker-clip",{"position":["absolute"],"inset":["var(--picker-head-height) 0 0"],"overflow":["hidden"],"z-index":["0"],"pointer-events":["none"]},["check:hover-layout"]],
  [[],".project-picker-clip--header",{"inset":["0 0 auto"],"height":["var(--picker-head-height)"],"z-index":["2"]},["check:hover-layout"]],
  [[],".project-picker-glass--header",{"inset":["0 0 auto"],"height":["var(--picker-height)"]},["check:hover-layout"]],
  [[],".map-surface:is(.has-constellation-nav,.has-command-focus) :is(.map-camera,.project-satellites)",{"opacity":["1"]},["check:header","check:command-placement","check:accessibility"]]
];
const surfacePresentationCss = source => {
  const tree = postcss.parse(source), parts = new Map();
  tree.walkRules(rule => {
    if (!rule.nodes.every(node => ["decl", "comment"].includes(node.type))) return;
    const context = [];
    for (let parent = rule.parent; parent.type !== "root"; parent = parent.parent) context.unshift("@" + parent.name + " " + parent.params);
    const groups = new Map();
    for (const branch of selectorParser().astSync(rule.selector).nodes) {
      const selector = selectorParser().processSync(branch.toString(), { lossless: false });
      const copy = rule.clone({ selector });
      copy.raws = {}; copy.nodes.forEach(node => { node.raws = {}; });
      const spec = surfacePresentationRules.find(([scope, owner]) => owner === selector && JSON.stringify(scope) === JSON.stringify(context));
      if (spec) copy.walkDecls(declaration => {
        if (declaration.important || !spec[2][declaration.prop]?.includes(declaration.value)) return;
        for (const owner of spec[3]) {
          if (!parts.has(owner)) parts.set(owner, []);
          parts.get(owner).push([context, selector, declaration.prop, declaration.value]);
        }
        declaration.remove();
      });
      if (copy.nodes.some(node => node.type !== "comment")) {
        const key = JSON.stringify(copy.nodes.filter(node => node.type !== "comment").map(node => node.toString()));
        if (groups.has(key)) groups.get(key).selector += "," + selector;
        else groups.set(key, copy);
      }
    }
    // Keep branches sharing declarations together: splitting an unrelated mixed
    // selector would incorrectly turn a shared rule into component-owned rules.
    for (const copy of groups.values()) rule.before(copy);
    rule.remove();
  });
  return { css: tree.toString(), parts };
};

// Promote exactly the existing switching rule from the compact-map container.
// Unchanged neighbouring rules also pin its insertion and removal positions.
const isSceneGuardPromotion = (before, after) => {
  const guard = '.map-surface.is-map-switching :is(.map-node, .map-node-label, .map-camera) { transition: none; }';
  const start = '.spatial-intro, .spatial-search, .spatial-field { display: none; }\n@container map-viewport (max-width: 900px) {';
  const nodeRule = '.focused-home .map-node { transition: opacity 180ms var(--motion-enter); }';
  try { postcss.parse(before); postcss.parse(after); } catch { return false; }
  if ([guard, start, `${nodeRule}\n${guard}`].some(text => before.split(text).length !== 2)) return false;
  return before.replace(start, start.replace('\n@container', `\n${guard}\n@container`))
    .replace(`${nodeRule}\n${guard}`, nodeRule) === after;
};

const cssComponents = (before, after) => {
  if (isSceneGuardPromotion(before, after)) return ["check:map-routes", "check:first-visit"];
  if (isMenuFooterSpacing(before, after)) return ['check:accessibility'];
  if (isSeparatorUpdate(before, after)) return ["check:accessibility", "check:case-view"];
  if (isMaterialForcedColorsPriority(before, after)) return ["check:core", "check:accessibility"];
  if (isMaterialCleanup(before, after) || isMaterialRecipeChange(before, after)) return ["materials"];
  const owners = Object.entries(cssOwners);
  // Mixed local edits select the union; a single shared rule keeps full CI.
  const owned = selector => owners.some(([, owns]) => owns(selector));
  const select = (left, right) => cssOutsideOwned(left, owned) !== cssOutsideOwned(right, owned) ? null
    : owners.filter(([, owns]) => cssOutsideOwned(left, selector => !owns(selector))
      !== cssOutsideOwned(right, selector => !owns(selector))).map(([id]) => id);
  const ordinary = select(before, after);
  if (ordinary) return ordinary;
  const left = surfacePresentationCss(before), right = surfacePresentationCss(after);
  const local = select(left.css, right.css);
  if (!local) return null;
  const presentation = [...new Set([...left.parts.keys(), ...right.parts.keys()])]
    .filter(owner => JSON.stringify(left.parts.get(owner) || []) !== JSON.stringify(right.parts.get(owner) || []));
  return [...new Set([...presentation, ...local])];
};

// The submit decoration uses the existing opening arrow; bindings and every
// surrounding byte remain protected, including the open-index close state.
const commandArrowOutside = source => {
  const empty = '<span class="command-dock__submit-mark" aria-hidden="true"></span>';
  const arrow = '<span class="command-dock__submit-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 12h15M13 5l7 7-7 7"/></svg></span>';
  if (source.split(empty).length + source.split(arrow).length !== 3) throw new Error("Unknown submit decoration");
  return source.replace(arrow, empty);
};

// Only passive header markup and the decorative search SVG can be replaced.
// Keep root attributes, interactive bindings and executable content outside the
// mask, so a tiny-looking event/URL/semantics change cannot use this lane.
const localHtml = (source, components) => {
  const ranges = [];
  const roots = new Set();
  const tree = parseHtml(source, { sourceCodeLocationInfo: true, onParseError(error) {
    if (error.code !== "missing-doctype") throw new Error(error.code);
  } });
  const visit = (node, owner) => {
    const attrs = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    const classes = (attrs.class || "").split(/\s+/);
    const id = node.tagName === "header" && classes.includes("site-header") ? "header"
      : node.tagName === "span" && classes.includes("command-dock__mark") && attrs["aria-hidden"] === "true" ? "search-icon" : null;
    if (id && components.includes(id)) {
      if (roots.has(id)) throw new Error("Ambiguous local UI root");
      roots.add(id);
      owner = id;
    }
    if (owner) {
      if (["script", "style", "link", "template", "iframe", "object", "embed", "base", "foreignObject", "use", "image", "animate", "set"].includes(node.tagName)
        || node.tagName?.includes("-")
        || Object.keys(attrs).some(name => /^on/.test(name) || ["style", "srcdoc"].includes(name))) {
        throw new Error("Executable content is not a local UI edit");
      }
      const loc = node.sourceCodeLocation;
      // Mask presentation attributes only. URLs, IDs, data hooks and ARIA stay.
      for (const name of ["class", "viewBox", "d", "cx", "cy", "r", "x", "y", "x1", "x2", "y1", "y2", "width", "height", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "focusable"]) {
        if (id || !loc?.attrs?.[name.toLowerCase()]) continue;
        const attr = loc.attrs[name.toLowerCase()];
        ranges.push([attr.startOffset, attr.endOffset]);
      }
    }
    for (const child of node.childNodes || []) visit(child, owner);
  };
  visit(tree);
  if (roots.size !== components.length) throw new Error("Missing local UI root");
  return ranges.sort((a, b) => b[0] - a[0]).reduce((text, [start, end]) => text.slice(0, start) + "\0UI\0" + text.slice(end), source);
};

const headerPresentation = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const scene = tree.body.find(node => node.type === "FunctionDeclaration" && node.id.name === "setScene");
  if (!scene) throw new Error("Missing scene owner");
  const material = node => node?.type === "Literal" && ["none", "mobile", "always", "desktop"].includes(node.value);
  const pureValue = node => material(node) || (node?.type === "ConditionalExpression"
    && node.test.type === "Identifier" && node.test.name === "focused"
    && material(node.consequent) && material(node.alternate));
  const statements = scene.body.body.filter(node => node.type === "ExpressionStatement"
    && node.expression.type === "AssignmentExpression" && node.expression.operator === "="
    && source.slice(node.expression.left.start, node.expression.left.end) === "header.dataset.materialActive"
    && pureValue(node.expression.right));
  if (statements.length > 1) throw new Error("Ambiguous header material update");
  return statements.reduce((text, node) => {
    const line = text.lastIndexOf("\n", node.start) + 1;
    const end = text.indexOf("\n", node.end);
    if (text.slice(line, node.start).trim() || text.slice(node.end, end < 0 ? text.length : end).trim()) throw new Error("Mixed header statement");
    return text.slice(0, line) + text.slice(end < 0 ? text.length : end + 1);
  }, source);
};

const settingsHtml = (source) => {
  const matches = [];
  const tree = parseHtml(source, { sourceCodeLocationInfo: true, onParseError(error) {
    if (error.code !== "missing-doctype") throw new Error(error.code);
  } });
  const visit = (node, inSettings = false) => {
    const attrs = node.attrs || [];
    if (attrs.some(({ name }) => name === "data-settings-panel")) {
      if (node.tagName !== "dialog") throw new Error("Unknown settings shell");
      matches.push(node);
      inSettings = true;
    }
    if (inSettings && (["script", "style", "link", "template", "iframe", "object", "base"].includes(node.tagName)
      || node.tagName?.includes("-")
      || attrs.some(({ name }) => /^on/.test(name) || ["style", "srcdoc"].includes(name)))) {
      throw new Error("Executable or global content in settings");
    }
    for (const child of node.childNodes || []) visit(child, inSettings);
  };
  visit(tree);
  if (matches.length !== 1) throw new Error("Settings shell must remain unique");
  const location = matches[0].sourceCodeLocation;
  if (!location?.endTag) throw new Error("Settings shell must close explicitly");
  // Preserve the actual dialog element, its semantics and external bindings.
  return source.slice(0, location.startTag.endOffset) + "\0SETTINGS\0" + source.slice(location.endTag.startOffset);
};

// A passive version label can move from settings to the two responsive service
// locations. Preserve every surrounding control, attribute and executable byte.
const siteVersionHtml = source => {
  const tree = parseHtml(source, { sourceCodeLocationInfo: true, onParseError(error) {
    if (error.code !== "missing-doctype") throw new Error(error.code);
  } });
  const ranges = [], places = [];
  const visit = node => {
    const attrs = Object.fromEntries((node.attrs || []).map(({name, value}) => [name, value]));
    if (attrs.class === 'display-control__status') {
      const children = node.childNodes.filter(child => child.nodeName !== '#text');
      const parent = (node.parentNode?.attrs || []).find(attr => attr.name === 'class')?.value;
      if (node.tagName !== 'div' || Object.keys(attrs).length !== 1 || parent !== 'display-control'
          || children.length !== 2 || children.some(child => child.tagName !== 'p')
          || children[0].attrs.find(attr => attr.name === 'class')?.value !== 'display-control__presence'
          || children[1].attrs.find(attr => attr.name === 'class')?.value !== 'site-version site-version--display') throw new Error('Unknown version status row');
      for (const loc of [node.sourceCodeLocation.startTag, node.sourceCodeLocation.endTag]) {
        const start = source.lastIndexOf('\n', loc.startOffset) + 1, end = source.indexOf('\n', loc.endOffset);
        if (end < 0 || source.slice(start, loc.startOffset).trim() || source.slice(loc.endOffset, end).trim()) throw new Error('Mixed version status line');
        ranges.push([start, end + 1]);
      }
    }
    if (Object.hasOwn(attrs, 'data-site-version')) {
      const parentClasses = (node.parentNode?.attrs || []).find(attr => attr.name === 'class')?.value.split(/\s+/) || [];
      const place = attrs.class === 'settings-panel__version' && parentClasses.includes('settings-panel__body') ? 'settings'
        : attrs.class === 'site-version site-version--menu' && parentClasses.includes('constellation-nav__utilities') ? 'menu'
        : attrs.class === 'site-version site-version--display' && (parentClasses.includes('display-control') || parentClasses.includes('display-control__status')) ? 'display' : null;
      if (!place || node.tagName !== 'p' || Object.keys(attrs).length !== 2 || attrs['data-site-version'] !== ''
          || node.childNodes?.length !== 1 || node.childNodes[0].nodeName !== '#text'
          || !/^Версия \d+\.\d+$/.test(node.childNodes[0].value)) throw new Error('Unknown site version markup');
      const loc = node.sourceCodeLocation;
      const start = source.lastIndexOf('\n', loc.startOffset) + 1;
      const end = source.indexOf('\n', loc.endOffset);
      if (end < 0 || source.slice(start, loc.startOffset).trim() || source.slice(loc.endOffset, end).trim()) throw new Error('Mixed site version line');
      ranges.push([start, end + 1]); places.push(place);
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(tree);
  if (!['settings', 'display,menu'].includes(places.sort().join(','))) throw new Error('Ambiguous site version locations');
  return ranges.sort((a,b) => b[0]-a[0]).reduce((text,[start,end]) => text.slice(0,start)+text.slice(end), source);
};

// The story entry may reuse the existing menu book glyph. Its link attributes,
// visible label and all surrounding markup stay outside this decorative mask.
const aboutEntryIconOutside = source => {
  const rowGroup = '            <div class="map-control-group map-control-group--secondary">\n';
  const coordinates = '            <div\n              class="map-control-group map-control-group--coordinates"';
  if (source.includes(rowGroup + coordinates)) source = source.replace(rowGroup + coordinates, coordinates)
    .replace(/(<a id="map-about-trigger"[^>]*>(?:(?!<\/a>)[\s\S])*<\/a>\n)            <\/div>\n/, '$1');
  const links = [...source.matchAll(/(<a\b[^>]*\bid="map-about-trigger"[^>]*>)([\s\S]*?)(<\/a>)/g)];
  if (links.length !== 1) throw new Error('Expected one map story entry');
  const [full, open, content, close] = links[0];
  const label = '<span>О КАРТЕ</span>';
  const icon = '<svg class="map-about-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6.5C9.5 4.8 6.5 4.3 3 5v14c3.5-.7 6.5-.2 9 1.5 2.5-1.7 5.5-2.2 9-1.5V5c-3.5-.7-6.5-.2-9 1.5Zm0 0v14"/></svg>';
  if (content !== label && content !== icon + label) throw new Error('Unknown story entry decoration');
  return source.replace(full, open + label + close);
};

const focusedReturnIconOutside = source => source.replace("<button type=\"button\" class=\"focused-return\" data-focused-return><svg class=\"focused-return__icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 12h15M13 5l7 7-7 7\"/></svg> Опорные точки</button>", "<button type=\"button\" class=\"focused-return\" data-focused-return><span aria-hidden=\"true\">←</span> Опорные точки</button>");

// Only the console resize callback and its observer belong to this lane.
// Imports, subscriptions, exported APIs, drag behavior and scroll lenses stay
// outside the mask. Normalize the earlier private callback name for its rename.
const consoleBoundsOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const found = new Set();
  tree.body = tree.body.map(statement => {
    if (statement.type !== "VariableDeclaration" || statement.declarations.length !== 1) return statement;
    const { id, init } = statement.declarations[0];
    const name = id.name === "syncFloatingConsoleBounds" ? "syncConsoleBounds" : id.name;
    if (!["syncConsoleBounds", "consoleResize"].includes(name)) return statement;
    if (found.has(name) || statement.kind !== "const") throw new Error("Ambiguous console owner");
    const callback = name === "syncConsoleBounds" ? init
      : init?.type === "NewExpression" && init.callee.name === "ResizeObserver" && init.arguments.length === 1
        ? init.arguments[0] : null;
    if (callback?.type !== "ArrowFunctionExpression" || callback.async) throw new Error("Unknown console callback");
    found.add(name);
    return { type: "ConsoleBoundsOwner", name };
  });
  if (found.size !== 2) throw new Error("Missing console owner");
  for (const statement of tree.body) {
    const expression = statement.expression;
    const call = expression?.type === 'ChainExpression' ? expression.expression : expression;
    if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression'
      || call.callee.computed || call.callee.property.name !== 'addEventListener') continue;
    const event = { window: 'resize', floatingConsoleMedia: 'change' }[call.callee.object.name];
    if (event && call.arguments[0]?.value === event && call.arguments[1]?.name === 'syncFloatingConsoleBounds') {
      call.arguments[1].name = 'syncConsoleBounds';
    }
  }

  return JSON.stringify(tree, (key, value) => {
    if (["start", "end", "raw"].includes(key)) return undefined;
    return value;
  });
};

const astShape = tree => JSON.stringify(tree, (key, value) => ["start", "end", "raw"].includes(key) ? undefined : value);
// A responsive scene restore may use the same brief switching guard as a click.
// Only the exact media-change guard is removed; URL/focus/scene logic stays equal.
const sceneRestorePrelude = parseJs(`
  const responsive = event?.type === 'change';
  const revision = sceneRevision;
  if (responsive) {
    document.body.classList.add('is-map-switching');
    pane.syncState();
  }
`, { ecmaVersion: "latest", sourceType: "module" }).body;
const sceneRestoreFinish = parseJs(`
  if (responsive) requestAnimationFrame(() => requestAnimationFrame(() => {
    if (revision !== sceneRevision) return;
    document.body.classList.remove('is-map-switching');
    pane.syncState();
  }));
`, { ecmaVersion: "latest", sourceType: "module" }).body[0];
const sceneRestoreResize = [
  "window.addEventListener('resize', syncMeasurements);",
  "window.addEventListener('resize', () => { pane.refresh(); syncMeasurements(); });"
].map(source => parseJs(source, { ecmaVersion: "latest", sourceType: "module" }).body[0]);
const sceneRestoreOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const restores = tree.body.filter(node => node.type === "FunctionDeclaration" && node.id.name === "restoreScene");
  if (restores.length !== 1) throw new Error("Missing unique scene restore");
  const restore = restores[0];
  const listener = sceneRestoreResize[restore.params.length ? 1 : 0];
  const resize = tree.body.map((node, index) => astShape(node) === astShape(listener) ? index : -1).filter(index => index !== -1);
  if (resize.length !== 1) throw new Error("Unknown resize synchronization");
  if (restore.params.length) {
    if (restore.params.length !== 1 || restore.params[0].type !== "Identifier" || restore.params[0].name !== "event"
      || astShape(restore.body.body.slice(2, 5)) !== astShape(sceneRestorePrelude)
      || astShape(restore.body.body.at(-1)) !== astShape(sceneRestoreFinish)) throw new Error("Unknown responsive scene guard");
    restore.params = [];
    restore.body.body.splice(2, 3);
    restore.body.body.pop();
    tree.body[resize[0]] = sceneRestoreResize[0];
  }
  return astShape(tree);
};
const sceneRestoreBuild = ["e6bb2bdd827258c2bd11c3d8ac8b713d0f78aade7cc3a729768cbbb74c310167", "7454340bc3b8b7806e14fc6c63b4fe9475438d2606d6807eb72c37544bd1ec88"];

// Core geometry owns solid silhouettes and only their readiness subscriptions.
// Surrounding layout, routing, node creation, imports and other exports stay protected.
const coreGeometryBindings = [
  'new MutationObserver(scheduleMapLinksRender).observe(mapButtons.get("garage"),{attributes:true,attributeFilter:["data-gravity-ready"]});',
  'matchMedia("(forced-colors:active)").addEventListener("change",scheduleMapLinksRender);'
].map(source => astShape(parseJs(source, { ecmaVersion: "latest", sourceType: "module" }).body[0]));
const mapCoreGeometryOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  let helper = 0, exported = 0, geometry = 0;
  const dependencies = [];
  const inspect = node => {
    if (!node || typeof node !== "object") return;
    if (["ImportDeclaration", "ImportExpression"].includes(node.type)) dependencies.push(astShape(node));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(inspect);
      else if (value && typeof value === "object") inspect(value);
    }
  };
  inspect(tree);
  const bindings = new Set();
  tree.body = tree.body.filter(statement => {
    if (statement.type !== "VariableDeclaration" || statement.declarations.length !== 1
      || statement.declarations[0].id.name !== "getMapCoreRadius") return true;
    const init = statement.declarations[0].init;
    if (helper++ || statement.kind !== "const" || init?.type !== "ArrowFunctionExpression"
      || init.async || init.params.length !== 1 || init.params[0].type !== "Identifier") throw new Error("Unknown core helper");
    return false;
  });
  for (const statement of tree.body) if (statement.type === "ExportNamedDeclaration") {
    statement.specifiers = statement.specifiers.filter(specifier => {
      if (specifier.exported.name !== "getMapCoreRadius") return true;
      if (exported++ || statement.source || specifier.local.name !== "getMapCoreRadius") throw new Error("Unknown core export");
      return false;
    });
  }
  for (const statement of tree.body) {
    if (statement.type !== "IfStatement" || statement.test.type !== "Identifier"
      || statement.test.name !== "mapLinksRoot" || statement.consequent.type !== "BlockStatement") continue;
    statement.consequent.body = statement.consequent.body.filter(node => {
      const binding = coreGeometryBindings.indexOf(astShape(node));
      if (binding === -1) return true;
      if (bindings.has(binding)) throw new Error("Duplicate core readiness subscription");
      bindings.add(binding);
      return false;
    });
  }
  const visit = node => {
    if (!node || typeof node !== "object") return node;
    if (node.type === "VariableDeclarator" && node.id.name === "getNodeGeometry") {
      if (geometry++ || node.init?.type !== "ArrowFunctionExpression" || node.init.async
        || node.init.params.length !== 1 || node.init.params[0].type !== "Identifier") throw new Error("Unknown node geometry owner");
      node.init.body = { type: "NodeCoreGeometry" };
    }
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) node[key] = value.map(visit);
      else if (value && typeof value === "object") node[key] = visit(value);
    }
    return node;
  };
  visit(tree);
  if (geometry !== 1 || helper !== exported || (bindings.size && bindings.size !== 2)) throw new Error("Incomplete core geometry boundary");
  return astShape([tree, dependencies]);
};

// This module owns the compact map's projection, gestures and labels. It keeps
// their complete existing presentation suite; new dependencies remain full scope.
const spatialMapBindings = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const imports = [];
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportExpression" || node.type?.startsWith("Export")) throw new Error("Unknown spatial dependency");
    if (node.type === "ImportDeclaration") {
      if (node.specifiers.some(specifier => specifier.type !== "ImportSpecifier")) throw new Error("Unknown spatial import");
      imports.push([node.source.value, node.specifiers.map(specifier => specifier.imported.name)
        .filter(name => !(node.source.value === "./map-engine.js" && name === "getMapCoreRadius")).sort()]);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(tree);
  if (imports.length !== 3) throw new Error("Incomplete spatial imports");
  return JSON.stringify(imports.sort(([a], [b]) => a.localeCompare(b)));
};

// Only the project-caption block and its exact layout cache belong here.
// Physics, picker state, inputs, canvas painting and module dependencies stay protected.
const practiceCaptionState = astShape(parseJs("const captionObstacle={entry:doc.querySelector('.overview-entry'),key:'',rect:null,pane:null,label:null};", { ecmaVersion: "latest", sourceType: "module" }).body[0]);
const practiceCaptionOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  let caption = 0, cache = 0;
  const removed = Symbol("caption cache");
  const inspect = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportExpression") throw new Error("Unknown caption dependency");
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(inspect);
      else if (value && typeof value === "object") inspect(value);
    }
  };
  inspect(tree);
  const visit = node => {
    if (!node || typeof node !== "object") return node;
    if (node.type === "VariableDeclaration" && node.declarations.some(item => item.id.name === "captionObstacle")) {
      if (cache++ || astShape(node) !== practiceCaptionState) throw new Error("Unknown caption cache");
      return removed;
    }
    if (node.type === "IfStatement" && node.test.type === "Identifier" && node.test.name === "labelRoot") {
      if (caption++ || node.alternate || node.consequent.type !== "BlockStatement") throw new Error("Unknown caption owner");
      node.consequent = { type: "PracticeCaptionPlacement" };
    }
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) node[key] = value.map(visit).filter(value => value !== removed);
      else if (value && typeof value === "object") node[key] = visit(value);
    }
    return node;
  };
  visit(tree);
  if (caption !== 1) throw new Error("Missing project caption owner");
  return astShape(tree);
};
const practiceCaptionBuild = ["00c9771fcb854428009aed1b5d72d06458bc5242f89a1a4ca48fa6aa0cd94b33", "eadacc6d1651ba4a76c55635e9e565a39a261c03dc7b87f90efe53cbbfef9ec0"];

// Only an opened label's side choice belongs to the hover contract. Keep rest
// labels, core geometry, routes, listeners, imports and every other helper equal.
const mapHoverLabelOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const owners = tree.body.filter(node => node.type === "VariableDeclaration" && node.kind === "const"
    && node.declarations.length === 1 && node.declarations[0].id.name === "placeMapLabel");
  if (owners.length !== 1) throw new Error("Missing unique hover label owner");
  const init = owners[0].declarations[0].init;
  if (init?.type !== "ArrowFunctionExpression" || init.async || init.body.type !== "BlockStatement") throw new Error("Unknown hover label owner");
  const inspect = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportExpression") throw new Error("Unknown hover label dependency");
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(inspect);
      else if (value && typeof value === "object") inspect(value);
    }
  };
  inspect(init.body);
  init.body = { type: "MapHoverLabelPlacement" };
  return astShape(tree);
};

// Label placement may change without rechecking media playback, WHOOP or the
// signature. All node geometry, links, events and exports remain outside this
// boundary. The two numeric offset expressions cannot execute arbitrary code.
const mapLabelsOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const found = new Set(), ranges = [];
  const numeric = node => (node?.type === "Literal" && typeof node.value === "number" && Number.isFinite(node.value))
    || (node?.type === "Identifier" && node.name === "glyphDiameter")
    || (node?.type === "BinaryExpression" && ["+", "-", "*", "/"].includes(node.operator)
      && numeric(node.left) && numeric(node.right));
  for (const statement of tree.body) {
    if (statement.type !== "VariableDeclaration" || statement.kind !== "const" || statement.declarations.length !== 1) continue;
    const { id, init } = statement.declarations[0];
    if (!["placeMapLabel", "placeMapRestLabels"].includes(id.name)) continue;
    if (found.has(id.name) || init?.type !== "ArrowFunctionExpression" || init.async) throw new Error("Unknown label placement owner");
    found.add(id.name);
    ranges.push([init.body.start, init.body.end]);
  }
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression" && source.slice(node.callee.start, node.callee.end) === "label.style.setProperty"
      && ["--label-offset", "--garage-label-offset"].includes(node.arguments[0]?.value)) {
      const [key, value] = node.arguments;
      if (found.has(key.value) || node.arguments.length !== 2 || value?.type !== "TemplateLiteral"
        || value.expressions.length !== 1 || value.quasis[0].value.raw !== "" || value.quasis[1].value.raw !== "px"
        || !numeric(value.expressions[0])) throw new Error("Unknown label offset");
      found.add(key.value);
      ranges.push([value.start, value.end]);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(tree);
  if (found.size !== 4) throw new Error("Missing label placement owner");
  return ranges.sort((a, b) => b[0] - a[0]).reduce((text, [start, end]) => text.slice(0, start) + "\0LABEL\0" + text.slice(end), source);
};

// Only card dismissal and node hover/focus callbacks use this lane. Selection,
// URL writing, geometry, node creation, keyboard navigation and media code stay
// outside it. Reuse their existing hover, case lifecycle and address checks.
const mapDismissalOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const removed = Symbol("dismissal owner");
  const helpers = new Set([
    "restoringMapFocus", "dismissedMapHover", "mapPointerPosition", "restoreMapFocus", "mapDismissPointer",
    "isMapDismissTarget", "startMapDismissPointer", "trackMapDismissPointer",
    "cancelMapDismissPointer", "dismissMapPointerClick",
  ]);
  const bindings = new Map([
    ["startMapDismissPointer", "pointerdown"], ["trackMapDismissPointer", "pointermove"],
    ["cancelMapDismissPointer", "pointercancel"], ["dismissMapPointerClick", "click"],
  ]);
  const found = new Set(), subscriptions = new Set();
  let close = 0, focus = 0, enter = 0, move = 0;
  tree.body = tree.body.filter(statement => {
    if (statement.type !== "VariableDeclaration" || statement.declarations.length !== 1) return true;
    const { id, init } = statement.declarations[0];
    if (!helpers.has(id.name)) return true;
    if (found.has(id.name)) throw new Error("Duplicate dismissal helper");
    const state = ["restoringMapFocus", "dismissedMapHover", "mapPointerPosition", "mapDismissPointer"].includes(id.name);
    if (state ? statement.kind !== "let" || init?.type !== "Literal"
      || init.value !== (id.name === "restoringMapFocus" ? false : null)
      : statement.kind !== "const" || init?.type !== "ArrowFunctionExpression" || init.async) {
      throw new Error("Unknown dismissal helper");
    }
    found.add(id.name);
    return false;
  });
  const visit = node => {
    if (!node || typeof node !== "object") return node;
    if (node.type === "ExpressionStatement") {
      const call = node.expression.type === "ChainExpression" ? node.expression.expression : node.expression;
      if (call.type === "CallExpression" && call.callee.type === "MemberExpression"
        && !call.callee.computed && call.callee.property.name === "addEventListener") {
        const owner = call.callee.object.name;
        const [event, callback, options] = call.arguments;
        if (owner === "document" && bindings.has(callback?.name)) {
          if (event?.value !== bindings.get(callback.name) || subscriptions.has(callback.name)) throw new Error("Unknown dismissal binding");
          const flags = options?.type === "ObjectExpression" ? Object.fromEntries(options.properties.map(property => [property.key.name, property.value.value])) : null;
          if (event.value === "click" ? call.arguments.length !== 2
            : event.value === "pointermove" ? call.arguments.length !== 3 || !flags?.capture || !flags?.passive || Object.keys(flags).length !== 2
              : call.arguments.length !== 3 || options?.value !== true) throw new Error("Unknown dismissal event options");
          subscriptions.add(callback.name);
          return removed;
        }
        if (owner === "button" && event?.value === "pointermove") {
          if (call.arguments.length !== 2 || callback?.type !== "ArrowFunctionExpression" || callback.async) throw new Error("Unknown hover resumption");
          move++;
          return removed;
        }
        if ((owner === "inspectorClose" && event?.value === "click")
          || (owner === "button" && ["focus", "pointerenter"].includes(event?.value))) {
          if (call.arguments.length !== 2 || callback?.type !== "ArrowFunctionExpression" || callback.async) throw new Error("Unknown card or preview callback");
          if (owner === "inspectorClose") close++;
          else if (event.value === "focus") focus++;
          else enter++;
          callback.body = { type: "MapDismissalCallback" };
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) node[key] = value.map(visit).filter(value => value !== removed);
      else if (value && typeof value === "object") node[key] = visit(value);
    }
    return node;
  };
  visit(tree);
  if (close !== 1 || focus !== 2 || enter !== 2 || (found.size
    ? found.size !== helpers.size || subscriptions.size !== bindings.size || move !== 1
    : subscriptions.size || move)) throw new Error("Incomplete dismissal boundary");
  return JSON.stringify(tree, (key, value) => ["start", "end", "raw"].includes(key) ? undefined : value);
};

// Literal source migration and its exact Terser derivative. The runtime hash
// accepts no additional physics, routing, event or rendering changes.
const pickerGlassSourcePatch = [
  [
    "    preview.prepend(pickerGlass);\n    const sizePickerHead=()=>{if(!picker.hidden)preview.style.setProperty('--picker-head-height',`${pickerHead.getBoundingClientRect().height}px`);};\n    new ResizeObserver(sizePickerHead).observe(pickerHead);\n",
    "    const headerGlass=pickerGlass.cloneNode();headerGlass.classList.add('project-picker-glass--header');headerGlass.dataset.materialSurface='project-picker-header';headerGlass.dataset.materialActive='always';\n    const glassClip=glass=>{const clip=doc.createElement('div');clip.className='project-picker-clip';clip.append(glass);return clip;};\n    const headerClip=glassClip(headerGlass);headerClip.classList.add('project-picker-clip--header');\n    preview.prepend(glassClip(pickerGlass),headerClip);\n    const sizePickerHead=()=>{if(!picker.hidden){preview.style.setProperty('--picker-head-height',`${pickerHead.getBoundingClientRect().height}px`);preview.style.setProperty('--picker-height',`${preview.clientHeight}px`);}};\n    const pickerSize=new ResizeObserver(sizePickerHead);pickerSize.observe(pickerHead);pickerSize.observe(preview);\n"
  ],
  [
    "      pickerGlass.hidden=!selected;preview.dataset.materialActive=selected?'none':'always';\n      if(selected){pickerHead.dataset.materialSurface='project-picker-header';pickerHead.dataset.materialActive='always';sizePickerHead();}\n      else{delete pickerHead.dataset.materialSurface;delete pickerHead.dataset.materialActive;}\n",
    "      pickerGlass.hidden=headerGlass.hidden=!selected;preview.dataset.materialActive=selected?'none':'always';\n      if(selected)sizePickerHead();\n"
  ]
];
const exactReplacements = (before, after, patches) => {
  try {
    parseJs(before, { ecmaVersion: "latest", sourceType: "module" });
    parseJs(after, { ecmaVersion: "latest", sourceType: "module" });
  } catch { return false; }
  let restored = after;
  for (const [old, replacement] of patches) {
    if (before.split(old).length !== 2 || restored.split(replacement).length !== 2) return false;
    restored = restored.replace(replacement, old);
  }
  return restored === before;
};
const pickerGlassBuild = ["5f44f34c2f63dc345c6c9e4087e3e38fbaa2c6341384064b9c13315959d8c794","00c9771fcb854428009aed1b5d72d06458bc5242f89a1a4ca48fa6aa0cd94b33"];
const commandFramePatch = [[
  "viewport.height = visual?.height || innerHeight;",
  'const frameInset = parseFloat(getComputedStyle(document.getElementById("split-shell")).paddingBottom) || 0;\n    viewport.height = Math.max(0, Math.min(viewport.top + (visual?.height || innerHeight), innerHeight - frameInset) - viewport.top);'
]];

// A static case illustration changes the work list only. Preserve every other
// data field and every other byte of the panel controller.
const casePostersOutside = source => {
  const tree = parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
  const ranges = [];
  for (const statement of tree.body) for (const declaration of statement.declarations || []) {
    if (declaration.id.name !== "mapItems" || declaration.init?.type !== "ArrayExpression") continue;
    for (const item of declaration.init.elements) {
      const caseStudy = item.properties?.find(p => p.type === "Property" && !p.computed && p.key.name === "caseStudy");
      if (caseStudy?.value.type !== "ObjectExpression") continue;
      for (const prop of caseStudy.value.properties) {
        if (prop.type !== "Property" || prop.computed || prop.method || prop.kind !== "init"
          || prop.key.name !== "previewPoster" || prop.value.type !== "Literal"
          || prop.value.value !== "assets/project-logos/academy-tn.svg") continue;
        const start = source.lastIndexOf("\n", prop.start);
        if (/^\n[ \t]*$/.test(source.slice(start, prop.start)) && source[prop.end] === ",") {
          ranges.push([start, prop.end + 1]);
        }
      }
    }
  }
  return ranges.sort((a, b) => b[0] - a[0]).reduce((text, [start, end]) => text.slice(0, start) + text.slice(end), source);
};

// The DD Camp favicon adds one static entry; all picker behaviour is unchanged.
const campIconSourcePatch = [[
  "  doronin:'assets/project-icons/doronin.svg',krainiuk:'assets/project-icons/krainiuk.svg',",
  "  doronin:'assets/project-icons/doronin.svg',krainiuk:'assets/project-icons/krainiuk.svg',\n  'dd-camp':'assets/project-icons/dd-camp.svg',"
]];
const campIconBuild = ["eadacc6d1651ba4a76c55635e9e565a39a261c03dc7b87f90efe53cbbfef9ec0", "f52cbee410307415b8314b4b5899dd93d536abd7f7eeb16f77b2f4b61e9d271d"];

// Only the reviewed related-link template and removal of its hover loader.
// Each source/build block is exact; selection, routes and every surrounding
// byte remain protected, including all other event listeners.
const relatedPosterBlocks = {
  "rendering/js/map-engine.js": [
    ["eccda6d4079dd22c5fa08d1d70f0cb1942670735f9bbe3febff05ef17a2ed562", "a7a29f11ffd6260b9872f45a5e29120aa096f3d9483cd15f40ea1b620279b41e"],
    ["a7a29f11ffd6260b9872f45a5e29120aa096f3d9483cd15f40ea1b620279b41e", "d7eb1fd759935ae61d8dfff842b95f5dd90085ebb530d55f51ac4593d1affa98"],
  ],
  "js/map-engine.js": [
    ["eefc1548613cb653bcc9a44cd73d3519d8952572bd235b4df3e75ce52e8941e0", "6217660eeabc11cc73980fffe7bde91ae0155f9fd4ae1bd6baf01ef7d69c9d74"],
    ["6217660eeabc11cc73980fffe7bde91ae0155f9fd4ae1bd6baf01ef7d69c9d74", "1fd5d2d3fe9976ab60b29e58129db59c94d317f1afe86d36e7bca6b045bb9079"],
  ],
};
const isRelatedPosterLayout = (path, before, after) => {
  if (!relatedPosterBlocks[path]) return false;
  try {
    const blocks = [before, after].map(source => {
      parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
      const startMarker = "const renderMapRelatedItems=", endMarker = "const setInspectorOpen=";
      if (source.split(startMarker).length !== 2 || source.split(endMarker).length !== 2) throw new Error("Unknown related-link owner");
      const start = source.indexOf(startMarker), end = source.indexOf(endMarker);
      if (end <= start) throw new Error("Unknown related-link boundaries");
      return { outside: source.slice(0, start) + source.slice(end), hash: createHash("sha256").update(source.slice(start, end)).digest("hex") };
    });
    return blocks[0].outside === blocks[1].outside
      && relatedPosterBlocks[path].some(pair => blocks.every((block, index) => block.hash === pair[index]));
  } catch { return false; }
};

// Only these reviewed reading-context changes select case-flow. The hashes
// fix each directed patch; every gap between the owners stays byte-identical.
const readingContextOwners = {
  "js/case-view.js": {
    ranges: [["let activeId = null;", "const frameMaterials = new Map();"],
      ["function reflect() {", "new MutationObserver(reflect).observe(mapInspector, {"]],
    hashes: ["546680ffe6ee138eb1fe462a4f08d09d1ab3f968a65db5699d0f4c4c721c596c", "2828b862306bd3c0288a830d8ee023c186658b687bef035fe41ca3a6106c4464"],
  },
  "js/panels.js": {
    ranges: [['mapInspector?.querySelector("[data-map-related]")?.addEventListener("click",', 'constellationNavHome?.addEventListener("click",']],
    hashes: ["a53ca5031eb341ab6f1ec97ac21f7cb7800d0b41729cc3ed09646dd2375b6fdb", "6be255860cfca630cb1c8ae14c22e902716ac1b65212aa525c3dd01a05e62bb9"],
  },
  "js/map-story.js": {
    ranges: [["if(h&&c.matches&&r.contains(o.target)", "if(!a.contains(o.target))"]],
    hashes: ["4c617c2051a6ced380dba6237ca0aa10b97b0e8b2edf13de6b022e211a20b50b", "43b66f8b3c313de8a46f70a4203627f7c87bf0ca59c085aa787570cd700bfd1e"],
  },
  "rendering/js/map-story.js": {
    ranges: [["  if(opened&&compact.matches&&map.contains(event.target)", "  if(!story.contains(event.target))"]],
    hashes: ["59d60d85a4c411c011834716bfc9c8a0488624070170c559f6120f3bc099d56d", "08b3cdd92a3bb4657be65f978b4bea69c86fc8a3b018324b6306bf4deb4c4715"],
  },
};
const isReadingContextFix = (path, before, after) => {
  const owner = readingContextOwners[path];
  if (!owner) return false;
  try {
    const blocks = [before, after].map(source => {
      parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
      const content = [], outside = [];
      let cursor = 0;
      for (const [startMarker, endMarker] of owner.ranges) {
        if (source.split(startMarker).length !== 2 || source.split(endMarker).length !== 2) throw new Error("Unknown reading-context owner");
        const start = source.indexOf(startMarker), end = source.indexOf(endMarker);
        if (start < cursor || end <= start) throw new Error("Unknown reading-context boundaries");
        outside.push(source.slice(cursor, start));
        content.push(source.slice(start, end));
        cursor = end;
      }
      outside.push(source.slice(cursor));
      return { outside: JSON.stringify(outside), hash: createHash("sha256").update(content.join("\0")).digest("hex") };
    });
    return blocks[0].outside === blocks[1].outside
      && blocks.every((block, index) => block.hash === owner.hashes[index]);
  } catch { return false; }
};

export const affectedComponents = (path, before, after, maskHtmlCopy) => {
  if (before.includes("\0") || after.includes("\0")) return null;
  try {
    if (isReadingContextFix(path, before, after)) return ["check:case-flow"];
    if (isRelatedPosterLayout(path, before, after)) return ["check:inspector-links", "check:case-view"];
    if (path === "rendering/practice-orbits.js" && exactReplacements(before, after, campIconSourcePatch)) return ["check:hover-layout"];
    if (path === "js/practice-orbits.js" && [before, after].every((source, index) => createHash("sha256").update(source).digest("hex") === campIconBuild[index])) return ["check:hover-layout"];
    if (path === "js/map-data.js" && casePostersOutside(before) === casePostersOutside(after)) return ["check:case-flow"];
    if (path === "js/panels.js") {
      const casePoster = source => source.replace("const poster = item.caseStudy?.previewPoster || getMapPreviewPoster(item);", "const poster = getMapPreviewPoster(item);");
      if (casePoster(before) === casePoster(after)) return ["check:case-flow"];
    }
    if (["js/viewport-ui.js", "rendering/js/viewport-ui.js"].includes(path) && exactReplacements(before, after, commandFramePatch)) return ["check:command-placement"];
    if (path === "rendering/js/focused-home.js" && sceneRestoreOutside(before) === sceneRestoreOutside(after)) return ["check:map-routes", "check:first-visit"];
    if (path === "js/focused-home.js" && [before, after].every((source, index) => createHash("sha256").update(source).digest("hex") === sceneRestoreBuild[index])) return ["check:map-routes", "check:first-visit"];
    if (path === "rendering/practice-orbits.js" && exactReplacements(before, after, pickerGlassSourcePatch)) return ["check:hover-layout"];
    if (path === "js/practice-orbits.js" && [before, after].every((source, index) => createHash("sha256").update(source).digest("hex") === pickerGlassBuild[index])) return ["check:hover-layout"];
    if (path === "rendering/practice-orbits.js" && practiceCaptionOutside(before) === practiceCaptionOutside(after)) return ["map-presentation"];
    if (path === "js/practice-orbits.js" && [before, after].every((source, index) => createHash("sha256").update(source).digest("hex") === practiceCaptionBuild[index])) return ["map-presentation"];
    if (["js/observation-route.js", "js/map-media.js", "js/panels.js"].includes(path)
      && overviewOutside(path, before) === overviewOutside(path, after)) return ["overview"];
    if (path === "404.html" && notFoundBindings(maskHtmlCopy(before).replaceAll("\0", "")) === notFoundBindings(maskHtmlCopy(after).replaceAll("\0", ""))) return ["not-found"];
    if (["js/viewport-ui.js", "rendering/js/viewport-ui.js"].includes(path) && isLensPointerGuard(before, after)) return ["scroll-lens-pointer"];
    if (path === "js/viewport-ui.js" && consoleBoundsOutside(before) === consoleBoundsOutside(after)) return ["console-bounds"];
    if (path === "js/map-engine.js") {
      try { if (mapCoreGeometryOutside(before) === mapCoreGeometryOutside(after)) return ["map-presentation"]; }
      catch { /* Other owners may still prove a local edit. */ }
    }
    if (["js/spatial-home.js", "rendering/js/spatial-home.js"].includes(path)
      && spatialMapBindings(before) === spatialMapBindings(after)) return ["map-presentation"];
    if (path === "js/map-engine.js" && mapHoverLabelOutside(before) === mapHoverLabelOutside(after)) return ["check:hover-layout"];
    if (path === "js/map-engine.js" && mapLabelsOutside(before) === mapLabelsOutside(after)) return ["map-labels"];
    if (path === "js/map-engine.js" && mapDismissalOutside(before) === mapDismissalOutside(after)) {
      return ["check:hover-layout", "check:case-flow", "check:case-view", "check:point-address"];
    }
    if (path === "scripts/browser-contracts.cjs") {
      // Only the compact index changes its background treatment; glass stays shared.
      const commandDepthOutside = source => source
        .replace('const backgroundDepth = !(mobile && element.matches(".map-surface.has-command-focus .site-header")) && (element.matches(', 'const backgroundDepth = element.matches(')
        .replace('"body.has-content-panel .control-console :is(.constellation-nav, .command-dock)",\n      )));', '"body.has-content-panel .control-console :is(.constellation-nav, .command-dock)",\n      ));');
      if (commandDepthOutside(before) === commandDepthOutside(after)) return ["check:command-placement"];
      const outside = source => source.replace(/const readMaterialAuditExpression = `[\s\S]*?`;/, "MATERIAL_AUDIT");
      if (before.includes("const readMaterialAuditExpression = `") && after.includes("const readMaterialAuditExpression = `")
          && outside(before) === outside(after)) return ["materials"];
    }
    if (path === "styles.css") return cssComponents(before, after);
    if (path === "index.html") {
      try {
        if (maskHtmlCopy(commandArrowOutside(before)) === maskHtmlCopy(commandArrowOutside(after))) return ["check:command-placement"];
      } catch { /* Non-decorative changes retain their owners. */ }
      for (const components of [["check:accessibility"], ["header"], ["check:accessibility", "header"]]) {
        try {
          const normalize = source => maskHtmlCopy(components.reduce((text, id) => id === "header" ? focusedReturnIconOutside(text) : aboutEntryIconOutside(text), source));
          if (normalize(before) === normalize(after)) return components;
        } catch { /* Other changes keep their existing coverage. */ }
      }
      try {
        if (maskHtmlCopy(siteVersionHtml(before)) === maskHtmlCopy(siteVersionHtml(after))) return ["check:accessibility"];
      } catch { /* Other markup keeps its existing component coverage. */ }
      try {
        if (overviewHtmlOutside(maskHtmlCopy(before).replaceAll("\0", "")) === overviewHtmlOutside(maskHtmlCopy(after).replaceAll("\0", ""))) return ["overview"];
      } catch { /* Other local owners may still prove the edit. */ }
      try {
        if (maskHtmlCopy(settingsHtml(before)) === maskHtmlCopy(settingsHtml(after))) return ["settings"];
      } catch { /* Missing settings do not prevent a local header/icon proof. */ }
      for (const components of [["header"], ["search-icon"], ["header", "search-icon"]]) {
        try {
          if (maskHtmlCopy(localHtml(before, components)) === maskHtmlCopy(localHtml(after, components))) return components;
        } catch { /* Another owner may still prove a local edit. */ }
      }
    }
    if (path === "js/focused-home.js" && headerPresentation(before) === headerPresentation(after)) return ["header"];
    if (path === "js/whoop-day.js") {
      const bindings = (source) => parseJs(source, { ecmaVersion: "latest", sourceType: "module" }).body
        .filter((node) => /^(Import|Export)/.test(node.type)).map((node) => source.slice(node.start, node.end));
      if (JSON.stringify(bindings(before)) === JSON.stringify(bindings(after))) return ["whoop"];
    }
  } catch {
    // Unknown syntax or a crossed ownership boundary always keeps full coverage.
  }
  return null;
};
