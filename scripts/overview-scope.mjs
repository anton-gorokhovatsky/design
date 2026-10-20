import { parse as parseJs } from 'acorn';
import { parse as parseHtml } from 'parse5';

const ast = source => parseJs(source, { ecmaVersion: 'latest', sourceType: 'module' });
const stable = tree => JSON.stringify(tree, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value);
const declaration = node => node.type === 'VariableDeclaration' && node.declarations.length === 1 ? node.declarations[0].id.name : null;
const marker = name => ({ type: 'OverviewOwner', name });
const replaceBlock = (tree, first, last) => {
  const start = tree.body.findIndex(node => declaration(node) === first);
  const end = tree.body.findIndex(node => declaration(node) === last);
  if (start < 0 || end < start || tree.body.slice(start, end + 1).some(node => /^(Import|Export)/.test(node.type))) throw new Error('Unknown overview block');
  tree.body.splice(start, end - start + 1, marker(first));
};

// Compare the rest of each shared module structurally. Imports, exports and
// neighboring navigation/media code cannot disappear inside an overview edit.
export const overviewOutside = (path, source) => {
  const tree = ast(source);
  if (path === 'js/observation-route.js') {
    for (const name of ['observationSteps', 'createObservationRoute']) {
      const node = tree.body.find(node => declaration(node) === name);
      if (!node) throw new Error('Missing route owner');
      tree.body[tree.body.indexOf(node)] = marker(name);
    }
  } else if (path === 'js/map-media.js') {
    replaceBlock(tree, 'observationVideo', 'renderObservationShowcase');
  } else if (path === 'js/panels.js') {
    const start = tree.body.findIndex(node => declaration(node) === 'workOverview');
    const end = tree.body.findIndex(node => declaration(node) === 'openPointFromContentPanel');
    if (start < 0 || end <= start || tree.body.slice(start, end).some(node => /^(Import|Export)/.test(node.type))) throw new Error('Missing overview entry');
    tree.body.splice(start, end - start, marker('entry'));
    for (const node of tree.body) {
      const call = node.expression;
      if (call?.type !== 'CallExpression') continue;
      if (call.callee.name === 'setInspectorReturnHandler') {
        const branch = call.arguments[0]?.body?.body?.find(node => node.type === 'IfStatement'
          && source.slice(node.test.start, node.test.end) === 'Number.isInteger(step)');
        if (!branch) throw new Error('Missing overview return');
        branch.consequent = marker('return');
      } else if (source.slice(call.callee.start, call.callee.end) === 'document.querySelector("[data-map-link]").addEventListener'
        && call.arguments[0]?.value === 'click' && call.arguments[1]?.type === 'ArrowFunctionExpression') {
        call.arguments[1].body = marker('details');
      }
    }
  } else throw new Error('Unknown overview module');
  return stable(tree);
};

const hooks = ['data-start-observation', 'data-observation-showcase', 'data-observation-index',
  'data-observation-preview', 'data-observation-controls', 'data-observation-status'];
const unsafe = node => ['script', 'style', 'link', 'template', 'iframe', 'object', 'embed', 'base', 'foreignObject', 'use', 'image', 'animate', 'set'].includes(node.tagName)
  || node.tagName?.includes('-') || node.attrs?.some(({ name }) => /^on/.test(name) || ['style', 'srcdoc'].includes(name));
const safeTree = node => {
  if (unsafe(node)) throw new Error('Executable content is not an overview layout edit');
  (node.childNodes || []).forEach(safeTree);
};
export const overviewHtmlOutside = source => {
  const roots = new Set();
  const tree = parseHtml(source, { onParseError(error) { if (error.code !== 'missing-doctype') throw new Error(error.code); } });
  const visit = node => {
    const attrs = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    const hook = hooks.find(name => name in attrs);
    if ('data-start-map-observation' in attrs) {
      safeTree(node);
      if (roots.has('map-entry') || node.tagName !== 'button' || attrs.type !== 'button'
        || attrs.class !== 'overview-entry' || Object.keys(attrs).some(name => !['type', 'class', 'data-start-map-observation'].includes(name))
        || !node.parentNode?.attrs?.some(({ name, value }) => name === 'class' && value.split(/\s+/).includes('map-camera'))) throw new Error('Unknown map entry');
      roots.add('map-entry');
      return null;
    }
    if (hook) {
      if (roots.has(hook)) throw new Error('Duplicate overview root');
      roots.add(hook);
      safeTree(node);
      // Keep each shell and its semantics. Only passive interior markup is owned.
      let attributes = node.attrs;
      if (hook === 'data-start-observation' && attrs['aria-labelledby']) {
        const ids = new Set();
        const collect = child => { child.attrs?.filter(attr => attr.name === 'id').forEach(attr => ids.add(attr.value)); (child.childNodes || []).forEach(collect); };
        collect(node);
        if (attrs['aria-labelledby'].split(/\s+/).some(id => !ids.has(id))) throw new Error('External entry label');
        attributes = attributes.filter(attr => attr.name !== 'aria-labelledby');
      }
      return { tag: node.tagName, attrs: attributes, children: 'OVERVIEW' };
    }
    if (node.nodeName === '#text') return node.value.trim() ? { text: node.value.trim() } : null;
    if (node.nodeName === '#comment') return null;
    return { tag: node.tagName || node.nodeName, attrs: node.attrs, name: node.name, publicId: node.publicId, systemId: node.systemId, template: node.content ? visit(node.content) : undefined, children: (node.childNodes || []).map(visit).filter(Boolean) };
  };
  const outside = visit(tree);
  if (!roots.has('data-start-observation')) throw new Error('Missing work entry');
  return JSON.stringify(outside);
};

// The error page is a separate document. Its scripts and external dependencies
// stay identical; shared CSS/JS changes are classified independently as usual.
export const notFoundBindings = source => {
  const bindings = [];
  let roots = 0;
  const tree = parseHtml(source, { sourceCodeLocationInfo: true, onParseError(error) { if (error.code !== 'missing-doctype') throw new Error(error.code); } });
  const visit = node => {
    if (node.tagName === "main" && node.attrs?.some(({ name, value }) => name === "class" && value.split(/\s+/).includes("not-found"))) {
      roots++;
      bindings.push(JSON.stringify(node.attrs));
    }
    if (node.attrs?.some(({ name }) => /^on/.test(name) || name === 'srcdoc')
      || ['iframe', 'object', 'embed', 'base', 'template'].includes(node.tagName) || node.tagName?.includes('-')) throw new Error('Unknown error page content');
    if (['script', 'link'].includes(node.tagName)) {
      const loc = node.sourceCodeLocation;
      bindings.push(source.slice(loc.startOffset, loc.endOffset));
    }
    (node.childNodes || []).forEach(visit);
  };
  visit(tree);
  if (roots !== 1) throw new Error("Missing error page root");
  return JSON.stringify(bindings);
};
