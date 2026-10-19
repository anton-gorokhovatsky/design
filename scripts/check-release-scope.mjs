import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChange, isCopyOnly, planRelease } from "./release-scope.mjs";
import { reelSpecs } from "./reel-specs.mjs";
import { browserMatrix, browserSteps, componentCoverage } from "./check-catalog.mjs";
import { pointAddressPaths, pointAddressRename } from "./point-address-scope.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
let checks = 0;
const change = (path, before, from, to, expected) => {
  assert.ok(before.includes(from), `Fixture must contain ${from}`);
  assert.equal(isCopyOnly(path, before, before.replace(from, to)), expected, `${path}: ${from} → ${to}`);
  checks += 1;
};

const panels = read("js/panels.js");
const map = read("js/map-data.js");
const route = read("js/observation-route.js");
const html = read("index.html");
// Reproduce the one-address release that previously selected the whole site.
const addressFixture = {
  'js/map-data.js': 'const mapItems = [{id: "parfyonov", x: 29, y: 73}];',
  'js/map-engine.js': 'const turns = new Map([["parfyonov", 104]]);',
  'js/sphere-surfaces.js': 'const profiles = {parfyonov: [1549, 6.2, 1, 0.55]};',
  'styles.css': ':root {--parfyonov-burgundy: #7a3346;} .map-node--parfyonov {color: var(--parfyonov-burgundy)}',
  'scripts/check-personal-media.mjs': 'select("parfyonov");',
  'scripts/check-sphere-motion.mjs': 'const ids = ["parfyonov"];',
  'js/panels.js': 'const applyUrlState = () => {\n  try {\n    const url = new URL(window.location.href);\n    const pointId = url.searchParams.get("point");\n  } finally {}\n};',
};
const aliasFixture = `    // Preserve published point and mobile-preview links after the slug rename.
    let hasLegacyPoint = false;
    for (const key of ["point", "preview"]) {
      if (url.searchParams.get(key) === "parfyonov") {
        url.searchParams.set(key, "parfenov");
        hasLegacyPoint = true;
      }
    }
    if (hasLegacyPoint) window.history.replaceState(window.history.state, "", url);
`;
const addressSources = Object.fromEntries(pointAddressPaths.map(path => {
  const before = addressFixture[path];
  let after = before.replaceAll('parfyonov', 'parfenov');
  if (path === 'js/panels.js') after = after.replace('    const pointId', aliasFixture + '    const pointId');
  return [path, { before, after }];
}));
assert.deepEqual(pointAddressRename(addressSources), {
  from: 'parfyonov', to: 'parfenov', paths: pointAddressPaths,
});
for (const [path, mutate] of [
  ['styles.css', value => value.replace('#7a3346', '#713c46')],
  ['js/map-engine.js', value => value.replace('["parfenov", 104]', '["parfenov", 105]')],
  ['js/map-data.js', value => value.replace('x: 29,', 'x: 30,')],
  ['js/panels.js', value => value.replace('window.history.replaceState', 'window.history.pushState')],
  ['js/panels.js', value => value.replace('=== "parfyonov"', '=== "wrong-old-address"')],
  ['js/panels.js', value => value.replace('hasLegacyPoint = true;', 'hasLegacyPoint = true; run();')],
]) {
  const changed = structuredClone(addressSources);
  changed[path].after = mutate(changed[path].after);
  assert.notEqual(changed[path].after, addressSources[path].after, 'Negative fixture must change the source');
  assert.equal(pointAddressRename(changed), null, `Not an address-only change: ${path}`);
}
const missingOwner = structuredClone(addressSources);
missingOwner['styles.css'].after = missingOwner['styles.css'].before;
assert.equal(pointAddressRename(missingOwner), null, 'A forgotten sphere selector cannot use the short lane');
const addressDirectory = mkdtempSync(join(tmpdir(), 'point-address-scope-'));
try {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Scope test', '-c', 'user.email=scope@example.invalid', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: addressDirectory, encoding: 'utf8', stdio: 'pipe' }).trim();
  const put = (path, source) => { mkdirSync(dirname(join(addressDirectory, path)), { recursive: true }); writeFileSync(join(addressDirectory, path), source); };
  git('init', '-b', 'main');
  for (const [path, source] of Object.entries(addressSources)) put(path, source.before);
  git('add', '.'); git('commit', '-m', 'published');
  const base = git('rev-parse', 'HEAD');
  for (const [path, source] of Object.entries(addressSources)) put(path, source.after);
  const plan = () => planRelease({ projectRoot: addressDirectory, base });
  assert.equal(plan().mode, 'components');
  assert.equal(plan().staticScope, 'copy');
  assert.deepEqual(plan().components, ['point-address']);
  assert.deepEqual(plan().pointAddresses, [{ from: 'parfyonov', to: 'parfenov' }]);
  assert.equal(plan().matrix.include.length, 2);
  git('add', '.'); git('commit', '-m', 'address');
  put('js/unrelated.js', 'export const changed = true;');
  git('add', '.'); git('commit', '-m', 'unrelated behavior');
  assert.equal(plan().mode, 'full', 'A rename cannot hide other unpublished behavior');
} finally { rmSync(addressDirectory, { recursive: true, force: true }); }
// The incident that prompted this lane: changing letter case inside runtime JS.
change("js/panels.js", panels, "КОРОТКИЙ ОБЗОР", "Короткий обзор", true);
change("js/map-data.js", map, "Самый важный профессиональный период:", "Профессиональный опыт:", true);
change("js/observation-route.js", route, "Почти четыре года развивал", "Развивал", true);
change("index.html", html, ">МОЯ РОЛЬ<", ">МОЙ ВКЛАД<", true);
change("index.html", html, 'aria-label="Управление обзором"', 'aria-label="Новая подпись"', true);
change("index.html", html, "Развивать цифровые продукты Музея", "Развивать цифровую среду Музея", true);
change("index.html", html, "Визуальный язык связали", "Визуальное решение связали", true);
change("index.html", html, "Цветовой цикл учитывает сезон", "Цветовой цикл следует сезону", true);
change("index.html", html, "UV-индекс меняет насыщенность палитры", "UV-индекс влияет на насыщенность палитры", true);
change("index.html", html, "В футере можно «прожить день в Сочи»", "Внизу сайта можно «прожить день в Сочи»", true);
change("index.html", html, "регулируется в OKLCH", "меняется в OKLCH", true);
change("index.html", html, /styles\.css\?v=[a-f0-9]{12}/.exec(html)[0], "styles.css?v=aaaaaaaaaaaa", true);
change("index.html", html, /\.\/js\/panels\.js\?v=[a-f0-9]{12}/.exec(html)[0], "./js/panels.js?v=aaaaaaaaaaaa", true);

change("js/observation-route.js", route, "20000", "10000", false);
change("js/panels.js", panels, 'id: "observation"', 'id: "time"', false);
change("js/panels.js", panels, 'title: "КОРОТКИЙ ОБЗОР"', 'title: getTitle()', false);
change("js/panels.js", panels, 'title: "КОРОТКИЙ ОБЗОР"', 'title: __COPY__', false);
change("js/panels.js", panels, 'title: "КОРОТКИЙ ОБЗОР"', 'title: \0COPY\0', false);
change("js/panels.js", panels, 'title: "КОРОТКИЙ ОБЗОР"', 'title: `Text ${run()}`', false);
change("js/panels.js", panels, 'title: "КОРОТКИЙ ОБЗОР"', 'get title() { return "Text"; }', false);
change("js/panels.js", panels, '"[data-constellation-nav]"', '"[data-other-nav]"', false);
change("js/panels.js", panels, "сеанс наблюдения обзор экскурсия маршрут", "хронология", false);
change("js/map-data.js", map, "https://garagemca.org/ru", "https://example.com/ru", false);
change("js/map-data.js", map, "x: 46", "x: 90", false);
change("js/observation-route.js", route, 'id: "garage", itemId: "garage"', 'id: "garage", itemId: "eleven"', false);
change("index.html", html, ">МОЯ РОЛЬ<", ">МОЯ <b>РОЛЬ</b><", false);
change("index.html", html, "data-map-evidence-role-label", "data-different-role-label", false);
change("index.html", html, 'href="styles.css', 'href="other.css', false);
change("index.html", html, '"./js/panels.js":', '"./js/other.js":', false);
change("index.html", html, '"role": "Старший менеджер', '"href": "Старший менеджер', false);
change("index.html", html, "<main>", '<main onclick="run()">', false);
change("index.html", html, 'aria-label="', 'onclick="', false);
assert.equal(isCopyOnly("index.html", '<script>const a="one"</script>', '<script>const a="two"</script>'), false);
assert.equal(isCopyOnly("index.html", '<style>.a{color:red}</style>', '<style>.a{color:blue}</style>'), false);
assert.equal(isCopyOnly("index.html", '<script type="application/json" id="other">{"task":"a"}</script>', '<script type="application/json" id="other">{"task":"b"}</script>'), false);
assert.equal(isCopyOnly("index.html", '<script src="https://other.test/js/panels.js?v=aaaaaaaaaaaa"></script>', '<script src="https://other.test/js/panels.js?v=bbbbbbbbbbbb"></script>'), false);
assert.equal(isCopyOnly("js/panels.js", panels, panels + "\nrun();"), false);
assert.equal(isCopyOnly("js/panels.js", panels, panels.replace('title: "', 'title: "\n')), false);
assert.equal(isCopyOnly("styles.css", "a{font-size:12px}", "a{font-size:14px}"), false);
assert.equal(isCopyOnly("unknown.js", 'const title="one";', 'const title="two";'), false);
assert.equal(isCopyOnly("README.md", "old", "new"), true);
assert.equal(isCopyOnly("AGENTS.md", "old", "new"), true, "Instruction-only edits do not change the rendered interface");

const scoped = (path, before, after, mode, components = []) => {
  assert.deepEqual(classifyChange(path, before, after), { mode, components }, `${path}: ${after.slice(-180)}`);
  checks += 1;
};
const styles = read("styles.css");
scoped("styles.css", "", '.control-console .command-dock__mark svg {fill: none; stroke: currentColor}', "components", ["search-icon"]);
scoped("styles.css", '.control-console .command-dock__mark::before {content: ""}', "", "components", ["search-icon"]);
scoped("styles.css", "", '.control-console .command-dock__mark svg, .map-node {fill: none}', "full");
scoped("styles.css", "", '.control-console .command-dock__mark + input {display: none}', "full");
for (const selector of ['.site-header', '.focused-home .site-header[data-material-surface]', '.brand__role', '.site-header .whoop-foot', '.whoop-readout[data-unavailable="true"] .whoop-stamp']) {
  scoped('styles.css', '', `${selector} {padding: 12px; color: var(--content-ink)}`, 'components', ['header']);
}
scoped('styles.css', '', '.site-header {padding: 12px}\n.command-dock__mark svg {fill: none}', 'components', ['header', 'search-icon']);
scoped('styles.css', '', '@media(max-width:900px){.site-header {padding: 12px}}', 'components', ['header']);
for (const selector of [':root', '.site-headerish', '.site-header + .practice-map', ':is(.site-header, .practice-map)', 'body:has(.site-header)', '.site-header, .map-node']) {
  scoped('styles.css', '', `${selector} {padding: 12px}`, 'full');
}
scoped('styles.css', '', '.site-header {padding: 12px}\n:root {--type-body: 2rem}', 'full');
scoped('styles.css', '', '@layer local {.site-header {padding: 12px}}', 'full');
const headerModule = `const header = document.querySelector('.site-header');\nfunction setScene(focused) {\n  header.dataset.materialActive = focused ? 'none' : 'mobile';\n  moveMap(focused);\n}\n`;
const sharedHeader = headerModule.replace("  header.dataset.materialActive = focused ? 'none' : 'mobile';\n", '');
scoped('js/focused-home.js', headerModule, sharedHeader, 'components', ['header']);
scoped('js/focused-home.js', sharedHeader, headerModule, 'components', ['header']);
for (const after of [
  sharedHeader.replace('moveMap(focused)', 'moveMap(false)'),
  headerModule.replace("'none'", 'chooseMaterial()'),
  headerModule.replace("'.site-header'", "'.practice-map'"),
  sharedHeader + '\nrun();',
]) scoped('js/focused-home.js', headerModule, after, 'full');
const headerShell = '<!doctype html><html><head><title>Test</title></head><body><header class="site-header"><p class="brand"><span class="brand__role">Author</span></p><button data-open-settings type="button">Settings</button></header></body></html>';
scoped('index.html', headerShell, headerShell.replace('class="brand__role"', 'class="brand__role extra"'), 'components', ['header']);
for (const after of [
  headerShell.replace('data-open-settings', 'data-open-panel="work"'),
  headerShell.replace('<span', '<span onclick="run()"'),
  headerShell.replace('</header>', '<script>run()</script></header>'),
  headerShell.replace('class="site-header"', 'class="site-header" hidden'),
]) scoped('index.html', headerShell, after, 'full');
const iconShell = '<!doctype html><html><head><title>Test</title></head><body><form><span class="command-dock__mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M0 0L10 10"/></svg></span><input data-command-input></form></body></html>';
scoped('index.html', iconShell, iconShell.replace('M0 0L10 10', 'M1 1L11 11'), 'components', ['search-icon']);
scoped('index.html', iconShell, iconShell.replace('M0 0L10 10', 'M1 1L11 11').replace('data-command-input', 'data-other-input'), 'full');
scoped('index.html', iconShell, iconShell.replace('M0 0L10 10', 'M1 1L11 11').replace('aria-hidden="true"', 'aria-hidden="false"'), 'full');
scoped("styles.css", styles, styles + "\n.settings-panel__note { margin-top: 8px; }", "components", ["settings"]);
scoped("styles.css", styles + "\n.settings-whoop__disclosure { color: red; }", styles, "components", ["settings"]);
for (const selector of [
  '.settings-panel :is(h2, h3, p)',
  '.settings-panel__row > button:not(:disabled):hover',
  'html[data-analytics="allowed"] .settings-panel__analytics-marker',
  '.settings-whoop > .settings-panel__note, .settings-presence h3',
]) scoped("styles.css", "", `${selector} { margin: 8px; }`, "components", ["settings"]);
for (const selector of [
  ':root', '.text-link', '.settings-panel, .map-node',
  '.settings-panel + .site-header', '.settings-panel ~ .control-console',
  ':is(.settings-panel, .map-node)', ':not(.settings-panel)',
  'body:has(.settings-panel) .map-node', '.settings-panelish',
]) scoped("styles.css", "", `${selector} { color: red; }`, "full");
scoped("styles.css", "", "@media(max-width: 600px) {.settings-panel__note {margin: 8px}}", "components", ["settings"]);
scoped("styles.css", "@media(min-width: 900px){.map-node {opacity: 1}}", "@media(min-width: 800px){.map-node {opacity: 1}}", "full");
scoped("styles.css", "", "@layer ui { .settings-panel { margin: 8px; } }", "full");
scoped("styles.css", "", "@keyframes show { from {opacity: 0} to {opacity: 1} }", "full");
scoped("styles.css", "", '.settings-panel { & + .map-node {opacity: 0} }', "full");
scoped("styles.css", "", '.settings-panel { color: "unclosed }', "full");
scoped("styles.css", styles, styles + '\n.settings-panel { margin: 8px; }\n:root { --space-4: 99px; }', "full");

const shell = '<!doctype html><html><head><title>Test</title></head><body><dialog data-settings-panel><p>Details</p></dialog><main>Map</main></body></html>';
scoped("index.html", shell, shell.replace('<p>Details</p>', '<section class="settings-panel__note">New details</section>'), "components", ["settings"]);
scoped("index.html", shell, shell.replace('<p>Details</p>', '<p>Details</p><button type="button" data-whoop-toggle>On</button>'), "components", ["settings"]);
for (const content of ['<script>run()</script>', '<style>body {display: none}</style>', '<p onclick="run()">Details</p>', '<iframe src="x"></iframe>', '<x-component></x-component>', '<p style="--shared: 1">Details</p>']) {
  scoped("index.html", shell, shell.replace('<p>Details</p>', content), "full");
}
scoped("index.html", shell, shell.replace('data-settings-panel', 'data-settings-panel open'), "full");
scoped("index.html", shell, shell.replace('<main>Map</main>', '<section>Map</section>'), "full");
scoped("index.html", shell, shell.replace('<p>Details</p>', '<p>Details</p></dialog><p>Outside</p>'), "full");
scoped("index.html", shell, shell.replace('</body>', '<dialog data-settings-panel></dialog></body>'), "full");
scoped("index.html", shell, shell.replace('<dialog data-settings-panel>', '<div data-settings-panel>').replace('</dialog>', '</div>'), "full");
scoped("js/whoop-day.js", 'const interval = 1000;', 'const interval = 2000;', "components", ["whoop"]);
scoped("js/whoop-day.js", 'const interval = 1000;', 'import "./map-engine.js"; const interval = 2000;', "full");
scoped("js/whoop-day.js", 'const interval = 1000;', 'const interval = ;', "full");
scoped("js/analytics.js", 'const enabled = false;', 'const enabled = true;', "full");
scoped("404.html", '<link href="styles.css?v=aaaaaaaaaaaa">', '<link href="styles.css?v=bbbbbbbbbbbb">', "copy");
scoped("404.html", '<link href="/styles.css?v=aaaaaaaaaaaa">', '<link href="/styles.css?v=bbbbbbbbbbbb">', "copy");
scoped("404.html", '<link href="//styles.css?v=aaaaaaaaaaaa">', '<link href="//styles.css?v=bbbbbbbbbbbb">', "full");
scoped("404.html", '<main>404</main>', '<section>404</section>', "full");

// Media may update only known files, literal URLs and measured timing. A
// changed expression, map coordinate, unrelated URL or new identity stays full.
const videoUrl = /assets\/reels\/garage-site\.mp4\?v=[a-f0-9]{12}/.exec(map)[0];
const posterUrl = /assets\/reel-posters\/garage-site\.jpg\?v=[a-f0-9]{12}/.exec(map)[0];
const chapterUrl = /assets\/reel-chapters\/garage-site-01\.mp4\?v=[a-f0-9]{12}/.exec(map)[0];
for (const url of [videoUrl, posterUrl, chapterUrl]) scoped("js/map-data.js", map, map.replace(url, url.replace(/v=.*/, "v=aaaaaaaaaaaa")), "components", ["media"]);
scoped("js/map-data.js", map, map.replace("previewDuration: 48.8", "previewDuration: 49"), "components", ["media"]);
scoped("js/map-data.js", map, map.replace("previewDuration: 48.8", "previewDuration: run()"), "full");
scoped("js/map-data.js", map, map.replace("previewDuration: 48.8", "previewDuration: -1"), "full");
scoped("js/map-data.js", map, map.replace(videoUrl, "https://example.com/reel.mp4"), "full");
scoped("js/map-data.js", map, map.replace(chapterUrl, "assets/reel-chapters/unknown.mp4?v=aaaaaaaaaaaa"), "full");
scoped("js/map-data.js", map, map.replace("previewDuration: 48.8", "previewDuration: 49").replace("x: 46", "x: 90"), "full");
const arbitrary = `const url = "${videoUrl}";`;
scoped("js/map-data.js", arbitrary, arbitrary.replace(/v=[a-f0-9]{12}/, "v=aaaaaaaaaaaa"), "full");
scoped("index.html", html, html.replace(posterUrl, posterUrl.replace(/v=.*/, "v=aaaaaaaaaaaa")), "components", ["media"]);
const scriptWithMediaUrl = `<script>const source = "${videoUrl}";</script>`;
scoped("index.html", scriptWithMediaUrl, scriptWithMediaUrl.replace(/v=[a-f0-9]{12}/, "v=aaaaaaaaaaaa"), "full");
const specSource = JSON.stringify(reelSpecs);
const changeSpec = callback => { const specs = structuredClone(reelSpecs); callback(specs[0]); return JSON.stringify(specs); };
scoped("scripts/reel-specs.json", specSource, changeSpec(spec => spec.posterAt = .8), "components", ["media"]);
scoped("scripts/reel-specs.json", specSource, changeSpec(spec => spec.master = "../other.mp4"), "full");
scoped("scripts/reel-specs.json", specSource, changeSpec(spec => spec.itemId = "new-item"), "full");
scoped("scripts/reel-specs.json", specSource, changeSpec(spec => spec.chapters[0].duration = 500), "full");
scoped("scripts/reel-specs.json", specSource, changeSpec(spec => spec.run = "code"), "full");

// The console ResizeObserver fix must not run unrelated media/signature jobs.
// Everything outside these two private callbacks still requires full coverage.
const viewport = read("js/viewport-ui.js");
const consoleFix = viewport.replace('requestAnimationFrame(syncConsoleBounds)', 'syncConsoleBounds()');
scoped("js/viewport-ui.js", viewport, consoleFix, "components", ["console-bounds"]);
scoped("js/viewport-ui.js", consoleFix.replaceAll('syncConsoleBounds', 'syncFloatingConsoleBounds'), viewport, "components", ["console-bounds"]);
for (const mutate of [
  value => value.replace('new ResizeObserver', 'new MutationObserver'),
  value => value.replace('observeScrollEdges,', 'observeScrollEdges as edges,'),
  value => value + '\nwindow.addEventListener("resize", unrelated);',
  value => 'import "./unrelated.js";\n' + value,
  value => value.replace('const syncConsoleBounds = () =>', 'const syncConsoleBounds = async () =>'),
  value => value.replace('window.addEventListener("resize", syncConsoleBounds)', 'window.addEventListener("scroll", syncConsoleBounds)'),
  value => value.replace('const consoleResize =', 'const consoleResize = ;'),
]) {
  const changed = mutate(consoleFix);
  assert.notEqual(changed, consoleFix, 'Boundary fixture must change source');
  scoped("js/viewport-ui.js", viewport, changed, "full");
}
const consoleMatrix = browserMatrix("components", ["console-bounds"]).include;
assert.equal(consoleMatrix.length, 6);
for (const engine of ["chromium", "webkit"]) assert.deepEqual(
  new Set(consoleMatrix.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))),
  new Set(componentCoverage["console-bounds"]),
);
assert.ok(consoleMatrix.filter(job => job.browser === 'webkit').every(job => job.runner === 'macos-15'));

// The complete old browser inventory remains mandatory, once per engine;
// WebKit core retains all four viewport/theme profiles. No shard may disappear.
const retainedChecks = ["signature", "case-flow", "personal-media", "inspector-links", "point-address", "accessibility", "map-routes", "hover-layout", "whoop-ui", "first-visit", "command-placement", "header", "search-icon", "sphere-motion", "case-view", "scroll-lens", "observation-route"];
const fullMatrix = browserMatrix("full").include;
assert.equal(new Set(fullMatrix.map(({ artifact }) => artifact)).size, fullMatrix.length);
for (const browser of ["chromium", "webkit"]) {
  const jobs = fullMatrix.filter((row) => row.browser === browser);
  const executed = jobs.flatMap(({ checks }) => checks.split(","));
  assert.deepEqual(executed.sort(), [...retainedChecks, ...Array(browser === "webkit" ? 4 : 1).fill("core"), ...(browser === "chromium" ? ["reels"] : [])].sort());
  assert.deepEqual(browserSteps(browser).map(({ id }) => id).sort(), ["core", ...retainedChecks].sort());
}
assert.deepEqual(fullMatrix.filter(({ scenario }) => scenario).map(({ scenario }) => scenario).sort(), ["320x568-dark", "320x568-light", "390x844-dark", "390x844-light"]);
for (const components of [["settings"], ["whoop"], ["settings", "whoop"]]) {
  const matrix = browserMatrix("components", components).include;
  const expected = new Set(components.flatMap((id) => componentCoverage[id]));
  for (const browser of ["chromium", "webkit"]) {
    assert.deepEqual(new Set(matrix.filter((row) => row.browser === browser).flatMap(({ checks }) => checks.split(","))), expected);
  }
  assert.ok(!matrix.some(({ checks }) => /reels|scroll-lens|map-routes|sphere-motion/.test(checks)));
}
const mediaMatrix = browserMatrix("components", ["media"]).include;
assert.equal(mediaMatrix.length, 7);
for (const browser of ["chromium", "webkit"]) assert.deepEqual(
  new Set(mediaMatrix.filter(row => row.browser === browser).flatMap(row => row.checks.split(","))),
  new Set(componentCoverage.media.filter(id => browser === "chromium" || id !== "reels")),
);
assert.equal(browserMatrix("full").include.length, 16);
assert.deepEqual(browserMatrix("copy"), { include: [] });
const addressMatrix = browserMatrix('components', ['point-address']).include;
assert.equal(addressMatrix.length, 2);
assert(addressMatrix.every(row => row.checks === 'point-address'));
for (const components of [['header'], ['search-icon'], ['header', 'search-icon']]) {
  const matrix = browserMatrix('components', components).include;
  assert.equal(matrix.length, 2, 'A local UI release has one focused job per engine.');
  assert(matrix.every(row => row.checks === components.join(',')));
}
assert.throws(() => browserMatrix("components", []));
assert.throws(() => browserMatrix("components", ["unknown"]));
assert.throws(() => browserMatrix("skip"));

// Exercise actual git history: an innocent last commit must not hide an
// unpublished behavior change, and staged/untracked changes count as well.
const directory = mkdtempSync(join(tmpdir(), "portfolio-release-scope-"));
try {
  const git = (...args) => execFileSync("git", ["-c", "user.name=Scope test", "-c", "user.email=scope@example.invalid", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-b", "main");
  mkdirSync(join(directory, "js"));
  writeFileSync(join(directory, "js/panels.js"), panels);
  writeFileSync(join(directory, "js/observation-route.js"), route);
  writeFileSync(join(directory, "index.html"), shell);
  writeFileSync(join(directory, "styles.css"), '.map-node {color: black}');
  writeFileSync(join(directory, "js/whoop-day.js"), 'const interval = 1000;');
  writeFileSync(join(directory, "js/focused-home.js"), headerModule);
  writeFileSync(join(directory, "js/viewport-ui.js"), viewport);
  mkdirSync(join(directory, "assets/reels"), { recursive: true });
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "original master");
  git("add", "."); git("commit", "-m", "published");
  const published = git("rev-parse", "HEAD");
  const plan = (options = {}) => planRelease({ projectRoot: directory, base: published, ...options });
  writeFileSync(join(directory, 'js/viewport-ui.js'), consoleFix);
  assert.deepEqual(plan().components, ['console-bounds']);
  assert.equal(plan().matrix.include.length, 6);
  writeFileSync(join(directory, 'js/viewport-ui.js'), viewport);

  writeFileSync(join(directory, 'js/focused-home.js'), sharedHeader);
  writeFileSync(join(directory, 'styles.css'), '.map-node {color: black}\n.site-header {padding: 12px}');
  assert.deepEqual(plan().components, ['header']);
  assert.equal(plan().staticScope, 'copy', 'Header changes retain the base static checks without FFmpeg.');
  git('add', '.'); git('commit', '-m', 'local header');
  assert.deepEqual(plan({target: 'HEAD'}).matrix, browserMatrix('components', ['header']));
  writeFileSync(join(directory, 'styles.css'), '.map-node {color: black}\n.site-header {padding: 12px}\n.command-dock__mark svg {fill: none}');
  assert.deepEqual(plan().components, ['header', 'search-icon']);
  writeFileSync(join(directory, 'styles.css'), '.map-node {color: red}\n.site-header {padding: 12px}');
  assert.equal(plan().mode, 'full', 'A shared map change cannot hide behind a header fix.');
  git('reset', '--hard', published);
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "updated master");
  assert.equal(plan().mode, "components");
  assert.deepEqual(plan().components, ["media"]);
  assert.equal(plan().staticScope, "static", "Media still requires FFmpeg and all static asset contracts");
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "original master");
  writeFileSync(join(directory, "js/panels.js"), panels.replace("КОРОТКИЙ ОБЗОР", "Короткий обзор"));
  assert.equal(plan().mode, "copy");
  git("add", ".");
  assert.equal(plan().mode, "copy", "Staged copy remains copy");
  git("commit", "-m", "copy");
  assert.equal(plan({ target: "HEAD" }).mode, "copy");
  writeFileSync(join(directory, "unexpected.txt"), "new file");
  assert.equal(plan().mode, "full", "Untracked files cannot evade preflight");
  rmSync(join(directory, "unexpected.txt"));
  writeFileSync(join(directory, "styles.css"), '.map-node {color: black}\n.settings-panel__note {margin: 8px}');
  writeFileSync(join(directory, "index.html"), shell.replace('<p>Details</p>', '<section>Details</section>'));
  assert.equal(plan().mode, "components");
  git("add", "."); git("commit", "-m", "settings layout");
  writeFileSync(join(directory, "js/whoop-day.js"), 'const interval = 2000;');
  git("add", "."); git("commit", "-m", "whoop refresh");
  assert.deepEqual(plan({ target: "HEAD" }).components, ["settings", "whoop"], "Component coverage combines unpublished commits");
  assert.deepEqual(plan({ target: "HEAD" }).matrix, browserMatrix("components", ["settings", "whoop"]));
  writeFileSync(join(directory, "js/observation-route.js"), route.replace("20000", "10000"));
  git("add", "."); git("commit", "-m", "unpublished timing");
  writeFileSync(join(directory, "js/panels.js"), panels);
  git("add", "."); git("commit", "-m", "another copy edit");
  assert.equal(plan({ base: "HEAD^", target: "HEAD" }).mode, "copy");
  assert.equal(plan({ target: "HEAD" }).mode, "full", "Entire unpublished range determines the gate");
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "updated master");
  assert.equal(plan().mode, "full", "Media cannot hide an unpublished behavior change");
  assert.equal(plan().staticScope, "static");
  assert.equal(plan({ base: "missing-ref" }).mode, "full");
  git("rm", "js/panels.js");
  assert.equal(plan().mode, "full", "Deleted data is not copy");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

// Run the actual aggregate shell from the workflow against all lanes and
// failed/skipped dependencies. A skipped browser matrix alone is never green.
const workflow = read(".github/workflows/quality.yml");
const gate = /- name: Require the selected checks[\s\S]*?        run: \|\n((?:          .*(?:\n|$))+)/.exec(workflow)?.[1]
  .replace(/^          /gm, "");
assert.ok(gate, "Quality must have a final gate");
for (const [scope, staticResult, browserResult, pass] of [
  ["copy", "success", "skipped", true], ["full", "success", "success", true],
  ["copy", "failure", "skipped", false], ["copy", "cancelled", "skipped", false],
  ["copy", "skipped", "skipped", false], ["full", "success", "skipped", false],
  ["full", "success", "failure", false], ["full", "success", "cancelled", false],
  ["full", "failure", "success", false], ["", "success", "skipped", false],
  ["components", "success", "success", true], ["components", "success", "skipped", false],
  ["components", "success", "failure", false], ["components", "success", "cancelled", false],
  ["components", "failure", "success", false], ["components", "skipped", "success", false],
]) {
  let passed = true;
  try {
    execFileSync("bash", ["-e", "-c", gate], {
      env: { ...process.env, SCOPE: scope, STATIC_RESULT: staticResult, BROWSER_RESULT: browserResult },
      stdio: "pipe",
    });
  } catch { passed = false; }
  assert.equal(passed, pass, `Quality gate: ${scope}/${staticResult}/${browserResult}`);
}
assert.match(workflow, /matrix: \$\{\{ fromJSON\(needs.static-contracts.outputs.matrix\) \}\}/);
assert.match(workflow, /--checks=\$\{\{ matrix.checks \}\}/);
assert.match(workflow, /if: steps.scope.outputs.static-scope == 'static'/, "Full and media lanes require FFmpeg");
// Independently published signatures keep one component job per engine. Known
// check tooling uses its own contracts; neither boundary masks runtime edits.
for (const path of ['signature/src/component.js', 'signature/src/motion.css', 'signature/src/mark.svg', 'signature/build.mjs', 'signature/demo.html', 'signature/v1/signature.js', 'signature/1.0.3/signature.js']) {
  assert.deepEqual(classifyChange(path, 'before', 'after'), { mode: 'components', components: ['signature'] });
}
for (const path of ['signature/../styles.css', 'signature-other/src/component.js', 'signature/unknown.txt']) {
  assert.equal(classifyChange(path, 'before', 'after').mode, 'full');
}
for (const owner of ['signature', 'checks']) {
  const matrix = browserMatrix('components', [owner]).include;
  assert.equal(matrix.length, owner === 'signature' ? 2 : 6);
  assert(matrix.filter(row => row.checks === 'signature').every(row => row.runner === 'ubuntu-latest'));
}
assert(fullMatrix.filter(row => row.browser === 'webkit' && row.checks !== 'signature').every(row => row.runner === 'macos-15'), 'Portfolio WebKit retains native media coverage');
const isolatedDirectory = mkdtempSync(join(tmpdir(), 'signature-release-scope-'));
try {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Scope test', '-c', 'user.email=scope@example.invalid', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: isolatedDirectory, encoding: 'utf8', stdio: 'pipe' }).trim();
  const put = (path, text) => { mkdirSync(dirname(join(isolatedDirectory, path)), { recursive: true }); writeFileSync(join(isolatedDirectory, path), text); };
  git('init', '-b', 'main');
  put('signature/src/component.js', 'export const VERSION = "1.0.2";');
  put('styles.css', '.map-node {color: black}');
  put('README.md', 'Published');
  git('add', '.'); git('commit', '-m', 'published');
  const base = git('rev-parse', 'HEAD');
  const plan = () => planRelease({ projectRoot: isolatedDirectory, base });
  put('signature/src/component.js', 'export const VERSION = "1.0.3";');
  put('signature/1.0.3/signature.js', 'new bundle');
  assert.equal(plan().staticScope, 'signature');
  assert.deepEqual(plan().components, ['signature'], 'New untracked fixed releases belong to the signature');
  git('add', '.'); git('commit', '-m', 'signature');
  put('README.md', 'A later copy-only commit'); git('add', '.'); git('commit', '-m', 'copy');
  assert.equal(plan().staticScope, 'signature', 'Selection uses the complete unpublished signature range');
  put('scripts/check-project.mjs', 'check runner');
  assert.equal(plan().staticScope, 'checks', 'Tooling changes run chooser and execution contracts');
  put('styles.css', '.map-node {color: red}');
  assert.equal(plan().mode, 'full', 'A signature cannot hide a shared portfolio style change');
  assert.equal(plan().staticScope, 'static');
  assert.deepEqual(plan().matrix, browserMatrix('full'));
} finally { rmSync(isolatedDirectory, { recursive: true, force: true }); }
console.log(`PASS: ${checks} copy/component/global changes; unsafe syntax, combined git history, complete browser coverage and all Quality lanes.`);
