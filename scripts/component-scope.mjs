import postcss from "postcss";
import { isMaterialCleanup, isMaterialForcedColorsPriority } from "./material-contract.mjs";
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
const cssOwners = {
  "map-story": selector => selectorParser().astSync(selector).nodes.every(branch =>
    branch.nodes.some(node => node.type === "id" && node.value === "story-pane")
    && branch.nodes.every(node => node.type !== "nesting"
      && (node.type !== "combinator" || ["", ">"].includes(node.value.trim())))),
  "story-bridge": selector => selectorParser().astSync(selector).nodes.every(branch =>
    branch.nodes.some(node => node.type === "id" && node.value === "story-bridge")
    && branch.nodes.every(node => node.type !== "nesting"
      && (node.type !== "combinator" || ["", ">"].includes(node.value.trim())))),
  settings: selector => !ownsClass(/^settings-panel__version$/)(selector) && ownsClass(settingsClass)(selector),
  "check:accessibility": ownsClass(/^(?:site-version(?:--[\w-]+)?|settings-panel__version|display-control__(?:presence|status)|map-about-trigger(?:__[\w-]+)?)$/),
  consent: ownsClass(/^analytics-notice(?:$|__)/),
  overview: ownsClass(/^(?:overview-entry|work-overview(?:__[\w-]+)?|observation-[\w-]+)$/),
  "map-presentation": selector => selectorParser().astSync(selector).nodes.every(branch =>
    branch.nodes[0]?.type === "class" && /^map-node(?:$|__|--)/.test(branch.nodes[0].value))
    && ownsClass(/^map-node(?:$|__|--)/)(selector),
  header: ownsClass(/^(?:site-header|brand(?:__[\w-]+)?|whoop-(?:readout|metrics|status|foot|stamp|level|compact-trigger))$/),
  "search-icon": ownsClass(/^command-dock__mark$/),
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

const cssComponents = (before, after) => {
  if (isMaterialForcedColorsPriority(before, after)) return ["check:core", "check:accessibility"];
  if (isMaterialCleanup(before, after)) return ["materials"];
  const owners = Object.entries(cssOwners);
  // Mixed local edits select the union; a single shared rule keeps full CI.
  const owned = selector => owners.some(([, owns]) => owns(selector));
  if (cssOutsideOwned(before, owned) !== cssOutsideOwned(after, owned)) return null;
  return owners.filter(([, owns]) => cssOutsideOwned(before, selector => !owns(selector))
    !== cssOutsideOwned(after, selector => !owns(selector))).map(([id]) => id);
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
  const links = [...source.matchAll(/(<a\b[^>]*\bid="map-about-trigger"[^>]*>)([\s\S]*?)(<\/a>)/g)];
  if (links.length !== 1) throw new Error('Expected one map story entry');
  const [full, open, content, close] = links[0];
  const label = '<span>О КАРТЕ</span>';
  const icon = '<svg class="map-about-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6.5C9.5 4.8 6.5 4.3 3 5v14c3.5-.7 6.5-.2 9 1.5 2.5-1.7 5.5-2.2 9-1.5V5c-3.5-.7-6.5-.2-9 1.5Zm0 0v14"/></svg>';
  if (content !== label && content !== icon + label) throw new Error('Unknown story entry decoration');
  return source.replace(full, open + label + close);
};

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

export const affectedComponents = (path, before, after, maskHtmlCopy) => {
  if (before.includes("\0") || after.includes("\0")) return null;
  try {
    if (["js/observation-route.js", "js/map-media.js", "js/panels.js"].includes(path)
      && overviewOutside(path, before) === overviewOutside(path, after)) return ["overview"];
    if (path === "404.html" && notFoundBindings(maskHtmlCopy(before).replaceAll("\0", "")) === notFoundBindings(maskHtmlCopy(after).replaceAll("\0", ""))) return ["not-found"];
    if (["js/viewport-ui.js", "rendering/js/viewport-ui.js"].includes(path) && isLensPointerGuard(before, after)) return ["scroll-lens-pointer"];
    if (path === "js/viewport-ui.js" && consoleBoundsOutside(before) === consoleBoundsOutside(after)) return ["console-bounds"];
    if (path === "js/map-engine.js" && mapLabelsOutside(before) === mapLabelsOutside(after)) return ["map-labels"];
    if (path === "scripts/browser-contracts.cjs") {
      const outside = source => source.replace(/const readMaterialAuditExpression = `[\s\S]*?`;/, "MATERIAL_AUDIT");
      if (before.includes("const readMaterialAuditExpression = `") && after.includes("const readMaterialAuditExpression = `")
          && outside(before) === outside(after)) return ["materials"];
    }
    if (path === "styles.css") return cssComponents(before, after);
    if (path === "index.html") {
      try {
        if (maskHtmlCopy(aboutEntryIconOutside(before)) === maskHtmlCopy(aboutEntryIconOutside(after))) return ["check:accessibility"];
      } catch { /* Other link changes keep their existing coverage. */ }
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
