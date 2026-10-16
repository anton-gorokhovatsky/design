import { parse } from 'acorn';

// An address-only rename must leave every other byte in these owners intact.
export const pointAddressPaths = [
  'js/map-data.js', 'js/map-engine.js', 'js/sphere-surfaces.js', 'js/panels.js',
  'styles.css', 'scripts/check-personal-media.mjs', 'scripts/check-sphere-motion.mjs',
];
const tree = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const shape = node => JSON.stringify(node, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value);
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
const ids = source => {
  const declaration = tree(source).body.flatMap(node => node.declarations || [])
    .find(node => node.id.name === 'mapItems');
  return declaration.init.elements.map(node => node.properties.find(property => property.key.name === 'id').value.value);
};

// Recognise only the existing replaceState alias block, including additional
// aliases expressed as a literal array or an else-if branch. No executable
// expression, extra statement, pushState or different query key is accepted.
export const readPointAliases = source => {
  const fn = tree(source).body.flatMap(node => node.declarations || [])
    .find(node => node.id.name === 'applyUrlState');
  const statements = fn?.init.body.body.find(node => node.type === 'TryStatement')?.block.body || [];
  const index = statements.findIndex(node => node.declarations?.[0]?.id.name === 'hasLegacyPoint');
  if (index === -1) return { source, aliases: {} };
  const block = statements.slice(index, index + 3);
  const aliases = {};
  const branches = [];
  let condition = block[1]?.body?.body?.[0];
  while (condition) {
    if (condition.type !== 'IfStatement') throw new Error('Unknown alias branch');
    const test = condition.test;
    const names = test.type === 'BinaryExpression' && test.operator === '==='
      ? [test.right.value] : test.callee?.property?.name === 'includes'
        ? test.callee.object.elements?.map(node => node.value) : [];
    const target = condition.consequent.body?.[0]?.expression?.arguments?.[1]?.value;
    if (!names?.length || !names.every(slug) || !slug(target)) throw new Error('Invalid alias');
    for (const name of names) {
      if (aliases[name]) throw new Error('Duplicate alias');
      aliases[name] = target;
    }
    const expression = test.type === 'BinaryExpression'
      ? `url.searchParams.get(key) === ${JSON.stringify(names[0])}`
      : `${JSON.stringify(names)}.includes(url.searchParams.get(key))`;
    branches.push(`if (${expression}) { url.searchParams.set(key, ${JSON.stringify(target)}); hasLegacyPoint = true; }`);
    condition = condition.alternate;
  }
  const expected = tree(`let hasLegacyPoint = false;
    for (const key of ["point", "preview"]) { ${branches.join(' else ')} }
    if (hasLegacyPoint) window.history.replaceState(window.history.state, "", url);`).body;
  if (shape(block) !== shape(expected)) throw new Error('Alias logic changed');
  const comment = '    // Preserve published point and mobile-preview links after the slug rename.\n';
  const start = source.lastIndexOf('\n', block[0].start) + 1;
  const end = source.indexOf('\n', block[2].end) + 1;
  return { aliases, source: (source.slice(0, start) + source.slice(end)).replace(comment, '') };
};

export const pointAddressRename = sources => {
  try {
    const beforeIds = ids(sources['js/map-data.js'].before);
    const afterIds = ids(sources['js/map-data.js'].after);
    if (beforeIds.length !== afterIds.length || new Set(afterIds).size !== afterIds.length) return null;
    const changed = beforeIds.flatMap((id, index) => id === afterIds[index] ? [] : [{ from: id, to: afterIds[index] }]);
    if (changed.length !== 1) return null;
    const { from, to } = changed[0];
    if (!slug(from) || !slug(to) || beforeIds.includes(to)) return null;
    const beforeAliases = readPointAliases(sources['js/panels.js'].before);
    const afterAliases = readPointAliases(sources['js/panels.js'].after);
    const expectedAliases = { ...Object.fromEntries(Object.entries(beforeAliases.aliases)
      .map(([name, target]) => [name, target === from ? to : target])), [from]: to };
    const sorted = object => Object.entries(object).sort(([a], [b]) => a.localeCompare(b));
    if (JSON.stringify(sorted(expectedAliases)) !== JSON.stringify(sorted(afterAliases.aliases))) return null;
    const paths = [];
    for (const path of pointAddressPaths) {
      const { before, after } = sources[path];
      const oldSource = path === 'js/panels.js' ? beforeAliases.source : before;
      const newSource = path === 'js/panels.js' ? afterAliases.source : after;
      if (oldSource.replaceAll(from, to) !== newSource) return null;
      if (before !== after) paths.push(path);
    }
    return { from, to, paths };
  } catch { return null; }
};
