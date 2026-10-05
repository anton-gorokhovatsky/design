import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChange, isCopyOnly, planRelease } from "./release-scope.mjs";
import { reelSpecs } from "./reel-specs.mjs";
import { browserMatrix, browserSteps, componentCoverage } from "./check-catalog.mjs";

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
// The incident that prompted this lane: changing letter case inside runtime JS.
change("js/panels.js", panels, "РАБОТЫ И ПОДХОД · 3 МИНУТЫ", "Работы и подход · 3 минуты", true);
change("js/map-data.js", map, "Самый важный профессиональный период:", "Профессиональный опыт:", true);
change("js/observation-route.js", route, "Почти четыре года развивал", "Развивал", true);
change("index.html", html, ">МОЯ РОЛЬ<", ">МОЙ ВКЛАД<", true);
change("index.html", html, 'aria-label="Работы и подход · 3 минуты"', 'aria-label="Новая подпись"', true);
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
change("js/panels.js", panels, 'title: "РАБОТЫ И ПОДХОД · 3 МИНУТЫ"', 'title: getTitle()', false);
change("js/panels.js", panels, 'title: "РАБОТЫ И ПОДХОД · 3 МИНУТЫ"', 'title: __COPY__', false);
change("js/panels.js", panels, 'title: "РАБОТЫ И ПОДХОД · 3 МИНУТЫ"', 'title: \0COPY\0', false);
change("js/panels.js", panels, 'title: "РАБОТЫ И ПОДХОД · 3 МИНУТЫ"', 'title: `Text ${run()}`', false);
change("js/panels.js", panels, 'title: "РАБОТЫ И ПОДХОД · 3 МИНУТЫ"', 'get title() { return "Text"; }', false);
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
assert.equal(isCopyOnly("AGENTS.md", "old", "new"), false);

const scoped = (path, before, after, mode, components = []) => {
  assert.deepEqual(classifyChange(path, before, after), { mode, components }, `${path}: ${after.slice(-180)}`);
  checks += 1;
};
const styles = read("styles.css");
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

// The complete old browser inventory remains mandatory, once per engine;
// WebKit core retains all four viewport/theme profiles. No shard may disappear.
const retainedChecks = ["case-flow", "personal-media", "inspector-links", "accessibility", "map-routes", "hover-layout", "whoop-ui", "first-visit", "command-placement", "sphere-motion", "case-view", "scroll-lens", "observation-route"];
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
assert.equal(browserMatrix("full").include.length, 14);
assert.deepEqual(browserMatrix("copy"), { include: [] });
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
  mkdirSync(join(directory, "assets/reels"), { recursive: true });
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "original master");
  git("add", "."); git("commit", "-m", "published");
  const published = git("rev-parse", "HEAD");
  const plan = (options = {}) => planRelease({ projectRoot: directory, base: published, ...options });
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "updated master");
  assert.equal(plan().mode, "components");
  assert.deepEqual(plan().components, ["media"]);
  assert.equal(plan().staticScope, "static", "Media still requires FFmpeg and all static asset contracts");
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "original master");
  writeFileSync(join(directory, "js/panels.js"), panels.replace("РАБОТЫ И ПОДХОД · 3 МИНУТЫ", "Работы и подход · 3 минуты"));
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
console.log(`PASS: ${checks} copy/component/global changes; unsafe syntax, combined git history, complete browser coverage and all Quality lanes.`);
