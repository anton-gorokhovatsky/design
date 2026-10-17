import postcss from "postcss";
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
  settings: ownsClass(settingsClass),
  header: ownsClass(/^(?:site-header|brand(?:__[\w-]+)?|whoop-(?:readout|metrics|status|foot|stamp|level|compact-trigger))$/),
  "search-icon": ownsClass(/^command-dock__mark$/),
};

const cssOutsideOwned = (source, owns) => {
  const visit = (node) => {
    if (node.type === "comment") return null;
    if (node.type === "rule" && node.nodes.every((child) => ["decl", "comment"].includes(child.type))
      && owns(node.selector)) return null;
    if (node.type === "root" || (node.type === "atrule" && ["media", "supports"].includes(node.name))) {
      const children = (node.nodes || []).map(visit).filter(Boolean);
      // Empty conditional groups have no effect. Other at-rules (@layer,
      // @property, @font-face, keyframes, imports) must be byte-identical.
      return children.length ? [node.type, node.name, node.params, children] : null;
    }
    return node.toString();
  };
  return JSON.stringify(visit(postcss.parse(source)));
};

const cssComponents = (before, after) => {
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

export const affectedComponents = (path, before, after, maskHtmlCopy) => {
  if (before.includes("\0") || after.includes("\0")) return null;
  try {
    if (path === "styles.css") return cssComponents(before, after);
    if (path === "index.html") {
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
