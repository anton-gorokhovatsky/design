import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { parse as parseHtml } from "parse5";
import { parse as parseJs } from "acorn";

// Only this explicit ownership boundary opts into the settings lane. Shared
// materials, typography, tokens, overlay rules and sibling selectors stay full.
const settingsClass = /^settings-(?:panel|whoop|presence)(?:$|__|--)/;
const ownsSelector = (selector) => selectorParser().astSync(selector).nodes.every((branch) => {
  let owned = false;
  for (const node of branch.nodes) {
    if (node.type === "class" && settingsClass.test(node.value)) owned = true;
    // A sibling of the root or a :has/:is reference is not its descendant.
    if (owned && node.type === "combinator" && !["", ">"].includes(node.value.trim())) return false;
    if (node.type === "nesting") return false;
  }
  return owned;
});

const cssOutsideSettings = (source) => {
  const visit = (node) => {
    if (node.type === "comment") return null;
    if (node.type === "rule" && node.nodes.every((child) => ["decl", "comment"].includes(child.type))
      && ownsSelector(node.selector)) return null;
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
    if (path === "styles.css" && cssOutsideSettings(before) === cssOutsideSettings(after)) return ["settings"];
    if (path === "index.html" && maskHtmlCopy(settingsHtml(before)) === maskHtmlCopy(settingsHtml(after))) return ["settings"];
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
