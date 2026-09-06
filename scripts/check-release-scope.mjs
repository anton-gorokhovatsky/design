import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isCopyOnly, planRelease } from "./release-scope.mjs";

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
change("js/panels.js", panels, "ОБЗОР РАБОТ ЗА 90 СЕКУНД", "Обзор работ за 90 секунд", true);
change("js/map-data.js", map, "Самый важный профессиональный период:", "Профессиональный опыт:", true);
change("js/observation-route.js", route, "Покажу работу в Музее", "Начнём с работы в Музее", true);
change("index.html", html, ">МОЯ РОЛЬ<", ">МОЙ ВКЛАД<", true);
change("index.html", html, 'aria-label="Обзор работ за 90 секунд"', 'aria-label="Новая подпись"', true);
change("index.html", html, "Развивать цифровые продукты Музея", "Развивать цифровую среду Музея", true);
change("index.html", html, /styles\.css\?v=[a-f0-9]{12}/.exec(html)[0], "styles.css?v=aaaaaaaaaaaa", true);
change("index.html", html, /\.\/js\/panels\.js\?v=[a-f0-9]{12}/.exec(html)[0], "./js/panels.js?v=aaaaaaaaaaaa", true);

change("js/observation-route.js", route, "90000 /", "60000 /", false);
change("js/panels.js", panels, 'id: "observation"', 'id: "time"', false);
change("js/panels.js", panels, 'title: "ОБЗОР РАБОТ ЗА 90 СЕКУНД"', 'title: getTitle()', false);
change("js/panels.js", panels, 'title: "ОБЗОР РАБОТ ЗА 90 СЕКУНД"', 'title: `Text ${run()}`', false);
change("js/panels.js", panels, 'title: "ОБЗОР РАБОТ ЗА 90 СЕКУНД"', 'get title() { return "Text"; }', false);
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
  git("add", "."); git("commit", "-m", "published");
  const published = git("rev-parse", "HEAD");
  const plan = (options = {}) => planRelease({ projectRoot: directory, base: published, ...options });
  writeFileSync(join(directory, "js/panels.js"), panels.replace("ОБЗОР РАБОТ ЗА 90 СЕКУНД", "Обзор работ за 90 секунд"));
  assert.equal(plan().mode, "copy");
  git("add", ".");
  assert.equal(plan().mode, "copy", "Staged copy remains copy");
  git("commit", "-m", "copy");
  assert.equal(plan({ target: "HEAD" }).mode, "copy");
  writeFileSync(join(directory, "unexpected.txt"), "new file");
  assert.equal(plan().mode, "full", "Untracked files cannot evade preflight");
  rmSync(join(directory, "unexpected.txt"));
  writeFileSync(join(directory, "js/observation-route.js"), route.replace("90000 /", "60000 /"));
  git("add", "."); git("commit", "-m", "unpublished timing");
  writeFileSync(join(directory, "js/panels.js"), panels);
  git("add", "."); git("commit", "-m", "another copy edit");
  assert.equal(plan({ base: "HEAD^", target: "HEAD" }).mode, "copy");
  assert.equal(plan({ target: "HEAD" }).mode, "full", "Entire unpublished range determines the gate");
  assert.equal(plan({ base: "missing-ref" }).mode, "full");
  git("rm", "js/panels.js");
  assert.equal(plan().mode, "full", "Deleted data is not copy");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

// Run the actual aggregate shell from the workflow against both lanes and
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
console.log(`PASS: ${checks} real-source copy/behavior changes; unsafe syntax, git history and both Quality lanes.`);
