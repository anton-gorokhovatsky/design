import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChange, isCopyOnly, planRelease, requireReleaseBase } from "./release-scope.mjs";
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
// Static case artwork must stay scoped; changed routing, data or executable
// poster expressions must not inherit this boundary.
const casePosterLine = '\n      previewPoster: "assets/project-logos/academy-tn.svg",';
const withoutCasePoster = map.replace(casePosterLine, "");
assert.deepEqual(classifyChange("js/map-data.js", withoutCasePoster, map).components, ["check:case-flow"]);
assert.equal(classifyChange("js/map-data.js", withoutCasePoster, map.replace('x: 24,', 'x: 25,')).mode, "full");
assert.equal(classifyChange("js/map-data.js", withoutCasePoster, map.replace('previewPoster: "assets/project-logos/academy-tn.svg"', 'previewPoster: getPoster()')).mode, "full");
const oldPanelPoster = panels.replace('item.caseStudy?.previewPoster || getMapPreviewPoster(item)', 'getMapPreviewPoster(item)');
assert.deepEqual(classifyChange("js/panels.js", oldPanelPoster, panels).components, ["check:case-flow"]);
assert.equal(classifyChange("js/panels.js", oldPanelPoster, panels.replace('item.caseStudy?.previewPoster ||', 'getPoster() ||')).mode, "full");
// A known project's HTTPS destination joins the media lane and checks its links.
const campDestination = 'const mapItems = [{id:"dd-camp",href:"https://old.example/",previewDuration:7.8,x:76}];';
const newCampDestination = campDestination.replace('https://old.example/', 'https://new.example/');
assert.deepEqual(classifyChange("js/map-data.js", campDestination, newCampDestination).components, ["media", "check:inspector-links"]);
assert.deepEqual(classifyChange("js/map-data.js", campDestination, newCampDestination.replace('7.8', '22')).components, ["media", "check:inspector-links"]);
for (const unsafe of ['javascript:alert(1)', 'http://example.com/', 'https://user:secret@example.com/']) {
  assert.equal(classifyChange("js/map-data.js", campDestination, campDestination.replace('https://old.example/', unsafe)).mode, "full");
}
assert.equal(classifyChange("js/map-data.js", campDestination, newCampDestination.replace('x:76', 'x:77')).mode, "full");
assert.equal(classifyChange("js/map-data.js", campDestination, campDestination.replace('"https://old.example/"', 'getDestination()')).mode, "full");
assert.equal(classifyChange("js/map-data.js", campDestination.replace('dd-camp', 'unknown'), newCampDestination.replace('dd-camp', 'unknown')).mode, "full");
assert.deepEqual(classifyChange("scripts/capture-reels.cjs", "", "").components, ["media"]);
assert.deepEqual(classifyChange("assets/project-icons/dd-camp.svg", "", "").components, ["check:hover-layout"]);
const campIconSource = read("rendering/practice-orbits.js");
const campIconBefore = campIconSource.replace("\n  'dd-camp':'assets/project-icons/dd-camp.svg',", "");
assert.deepEqual(classifyChange("rendering/practice-orbits.js", campIconBefore, campIconSource).components, ["check:hover-layout"]);
assert.equal(classifyChange("rendering/practice-orbits.js", campIconBefore, campIconSource + "\nglobalThis.unrelated = true;").mode, "full");
const route = read("js/observation-route.js");
const html = read("index.html");
// Keep the legacy embedded-copy contract while current details are external data.
const embeddedEvidence = {
  garage: { task: "Развивать цифровые продукты Музея", role: "Старший менеджер веб-разработки" },
  narkomfin: { idea: "Визуальный язык связали с местом", weather: "Цветовой цикл учитывает сезон" },
  hotline: { feature: "UV-индекс меняет насыщенность палитры", timePreview: "В футере можно «прожить день в Сочи»", technical: "Свет регулируется в OKLCH" },
};
const embeddedHtml = html.replace("</body>", `<script type="application/json" id="map-evidence-data">${JSON.stringify(embeddedEvidence, null, 2)}</script></body>`);

// A description-only edit keeps the same short gate as map-data copy.
const descriptionFixture = '{"descriptions":{"running":"Бегаю."},"evidence":{"running":{"role":"Автор"}},"related":{"running":["hotline-camp"]},"figures":{"running":{"href":"https://example.com"}}}';
change("js/case-content.json", descriptionFixture, "Бегаю.", "Бегаю пять раз в неделю.", true);
change("js/case-content.json", descriptionFixture, '"running":"Бегаю."', '"sport":"Бегаю."', false);
change("js/case-content.json", descriptionFixture, '"Бегаю."', '42', false);
change("js/case-content.json", descriptionFixture, '"Бегаю."', '"Бегаю.","new":"Новая точка"', false);
change("js/case-content.json", descriptionFixture, "Автор", "Другой вклад", true);
change("js/case-content.json", descriptionFixture, "hotline-camp", "dd-camp", false);
change("js/case-content.json", descriptionFixture, "https://example.com", "https://example.org", false);
change("js/case-content.json", descriptionFixture, '"Бегаю."', '(() => "Бегаю.")()', false);

// Editorial evidence protects its fields, metadata and rich-text destinations.
const evidenceCopyFixture = JSON.stringify({ evidence: { garage: { task: "Задача", role: "Работа", result: "Итог", roleSource: { label: "Источник", href: "https://example.com/source" }, labels: { role: "Роль" } } }, keywords: ["поиск"] });
change("js/case-content.json", evidenceCopyFixture, "Задача", "Новая формулировка", true);
change("js/case-content.json", evidenceCopyFixture, '"task":', '"href":', false);
change("js/case-content.json", evidenceCopyFixture, "https://example.com/source", "https://other.example/", false);
change("js/case-content.json", evidenceCopyFixture, "Источник", "Другое основание", false);
change("js/case-content.json", evidenceCopyFixture, "поиск", "другой запрос", false);
change("js/case-content.json", evidenceCopyFixture, "Задача", "<b>Задача</b>", false);

// Exactly the old targets and order survive the caption migration. Empty text
// hides only the caption; it cannot disguise an identity, URL or data change.
const legacyRelatedFixture = JSON.stringify({ descriptions: { running: "Бегаю." }, evidence: { running: { role: "Автор" } }, related: { running: [["hotline-camp", "Программа кэмпа"], ["dusty", "Другой проект клуба"]] }, figures: { running: { href: "https://example.com" } } });
const captionData = JSON.parse(legacyRelatedFixture);
captionData.related.running = ["hotline-camp", "dusty"];
captionData.relatedCaptions = { "hotline-camp": "Триатлонный кэмп в Сочи", dusty: "Магазин мерча" };
const captionFixture = JSON.stringify(captionData);
assert.equal(isCopyOnly("js/case-content.json", legacyRelatedFixture, captionFixture), false);
assert.deepEqual(classifyChange("js/case-content.json", legacyRelatedFixture, captionFixture), { mode: "components", components: ["check:inspector-links", "check:case-view"] });
change("js/case-content.json", captionFixture, "Магазин мерча", "", true);
change("js/case-content.json", captionFixture, "Сочи", "Сочи перед стартом", true);
for (const changed of [
  captionFixture.replace('["hotline-camp","dusty"]', '["dusty","hotline-camp"]'),
  captionFixture.replace('["hotline-camp","dusty"]', '["hotline-camp","dusty","new-project"]'),
  captionFixture.replace('["hotline-camp","dusty"]', '["hotline-camp","dd-camp"]'),
  captionFixture.replace('"hotline-camp":"Триатлонный', '"new-project":"Триатлонный'),
  captionFixture.replace('"Магазин мерча"', '42'),
  captionFixture.replace('"Магазин мерча"', '"<b>Магазин</b>"'),
  captionFixture.replace('https://example.com', 'https://other.example/'),
  captionFixture.replace('"role":"Автор"', '"role":"Автор","keywords":["new"]'),
  captionFixture.replace('"running":[', '"new-project":['),
  captionFixture.replace('"dusty":"Магазин мерча"', '"dusty":"Магазин мерча","dusty":"Дубликат"'),
]) {
  assert.notEqual(changed, captionFixture);
  assert.equal(isCopyOnly("js/case-content.json", legacyRelatedFixture, changed), false);
  assert.equal(classifyChange("js/case-content.json", legacyRelatedFixture, changed).mode, "full");
  checks += 1;
}

for (const targets of [
  [["hotline-camp", "Старый формат"], ["dusty", "Старый формат"]],
  [["hotline-camp", "Старый формат"], "dusty"],
]) {
  const changed = JSON.stringify({ ...captionData, related: { running: targets } });
  assert.equal(classifyChange("js/case-content.json", captionFixture, changed).mode, "full");
  assert.equal(classifyChange("js/case-content.json", legacyRelatedFixture, changed).mode, targets.every(Array.isArray) ? "components" : "full");
  checks += 2;
}

// Static point art and the carpet action are one directed data addition.
// Existing content, related order and every other destination remain exact.
const relatedPresentationBefore = execFileSync('git', ['show', 'b43f05f0cc1a50ef526027d7dacf0fba949ff22b:js/case-content.json'], { cwd: root, encoding: 'utf8' });
const relatedPresentationData = JSON.parse(relatedPresentationBefore);
relatedPresentationData.relatedMedia = Object.fromEntries(['running', 'private-practice', 'garage', 'garage-app', 'parfenov']
  .map(id => [id, Object.fromEntries(['light', 'dark'].map(theme => [theme, `assets/point-thumbnails/${id}-${theme}.webp`]))]));
relatedPresentationData.relatedActions = { doronin: { label: 'Купить тот самый ковёр от Вити', href: 'https://doronin.store/tproduct/840694551052-kovyor' } };
const relatedPresentationAfter = JSON.stringify(relatedPresentationData);
const relatedPresentationChecks = ['check:inspector-links', 'check:case-view', 'check:case-flow'];
assert.equal(isCopyOnly('js/case-content.json', relatedPresentationBefore, relatedPresentationAfter), false);
assert.deepEqual(classifyChange('js/case-content.json', relatedPresentationBefore, relatedPresentationAfter), { mode: 'components', components: relatedPresentationChecks });
assert.equal(classifyChange('js/case-content.json', relatedPresentationAfter, relatedPresentationBefore).mode, 'full');
for (const change of [
  data => { data.relatedMedia.running.light = data.relatedMedia.running.dark; },
  data => { delete data.relatedMedia.running.dark; },
  data => { data.relatedMedia.unrelated = data.relatedMedia.running; },
  data => { data.relatedActions.doronin.href = 'https://doronin.store/other'; },
  data => { data.relatedActions.doronin.label = '<b>Купить</b>'; },
  data => { data.relatedActions.unrelated = data.relatedActions.doronin; },
  data => { data.related.dusty.reverse(); },
  data => { data.related.dusty[0] = 'unrelated'; },
  data => { data.descriptions.running = 'Unreviewed content'; },
  data => { data.extra = true; },
]) {
  const changed = structuredClone(relatedPresentationData); change(changed);
  assert.equal(classifyChange('js/case-content.json', relatedPresentationBefore, JSON.stringify(changed)).mode, 'full');
  checks += 1;
}
assert.equal(classifyChange('js/case-content.json', relatedPresentationBefore, '{"relatedMedia":{},' + relatedPresentationAfter.slice(1)).mode, 'full', 'Duplicate JSON owners cannot hide data changes');
assert.equal(classifyChange('js/case-content.json', relatedPresentationAfter, relatedPresentationAfter.replace('840694551052-kovyor', 'other-product')).mode, 'full', 'Later product URL changes do not inherit this migration');

// Project names and share metadata are copy; routes, schema and scripts are not.
const nameFixture = 'const mapItems = [{id:"dusty",mapLabel:"Мерч клуба",href:"https://example.com"}];';
change("js/map-data.js", nameFixture, "Мерч клуба", "Мерч Dusty Dumbbells", true);
change("js/map-data.js", nameFixture, 'mapLabel:"Мерч клуба"', 'mapLabel:getLabel()', false);
const shareFixture = '<title>Проект</title><meta name="description" content="Описание"><meta property="og:title" content="Проект"><meta name="robots" content="index"><link rel="canonical" href="https://example.com"><script type="application/ld+json">{"name":"Проект","url":"https://example.com","creator":{"name":"Автор"}}</script><script>go("route")</script>';
for (const [from, to, expected] of [
  ['<title>Проект</title>', '<title>Челлендж</title>', true],
  ['content="Описание"', 'content="Новое описание"', true],
  ['property="og:title" content="Проект"', 'property="og:title" content="Челлендж"', true],
  ['"name":"Проект"', '"name":"Челлендж"', true],
  ['"name":"Автор"', '"name":"Другой автор"', false],
  ['content="index"', 'content="noindex"', false],
  ['href="https://example.com"', 'href="https://other.com"', false],
  ['"url":"https://example.com"', '"url":"https://other.com"', false],
  ['go("route")', 'go("elsewhere")', false],
  ['"name":"Проект"', '"name":run()', false],
]) change("work/eleven/index.html", shareFixture, from, to, expected);
change("work/unknown/index.html", shareFixture, "Описание", "Другое описание", false);
for (const path of ["js/focused-home.js", "rendering/js/focused-home.js"]) {
  const source = read(path);
  change(path, source, "Челлендж «11 111»", "Велочеллендж «11 111»", true);
  change(path, source, "ИНСТИТУЦИИ", "КОМПАНИИ", false);
  assert.equal(isCopyOnly(path, source, source + "\nrun();"), false);
  checks += 1;
}

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
change("js/map-data.js", map, 'linkLabel: "НЕ СФОТКАЛ — НЕ БЕГАЛ"', 'linkLabel: "Открыть Instagram"', true);
change("js/map-data.js", map, 'linkLabel: "НЕ СФОТКАЛ — НЕ БЕГАЛ"', 'linkLabel: getLabel()', false);
change("index.html", html, 'data-context="СОСТАВ КАРТЫ"', 'data-context="Состав"', true);
change("index.html", html, 'data-floating-console="view"', 'data-floating-console="other"', false);
change("index.html", '<div data-context="before"></div>', 'data-context="before"', 'data-context="after"', false);

change("js/observation-route.js", route, "Почти четыре года развивал", "Развивал", true);
change("index.html", html, ">МОЯ РОЛЬ<", ">МОЙ ВКЛАД<", true);
change("index.html", html, 'aria-label="Управление обзором"', 'aria-label="Новая подпись"', true);
change("index.html", embeddedHtml, "Развивать цифровые продукты Музея", "Развивать цифровую среду Музея", true);
change("index.html", embeddedHtml, "Визуальный язык связали", "Визуальное решение связали", true);
change("index.html", embeddedHtml, "Цветовой цикл учитывает сезон", "Цветовой цикл следует сезону", true);
change("index.html", embeddedHtml, "UV-индекс меняет насыщенность палитры", "UV-индекс влияет на насыщенность палитры", true);
change("index.html", embeddedHtml, "В футере можно «прожить день в Сочи»", "Внизу сайта можно «прожить день в Сочи»", true);
change("index.html", embeddedHtml, "регулируется в OKLCH", "меняется в OKLCH", true);
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
change("index.html", embeddedHtml, '"role": "Старший менеджер', '"href": "Старший менеджер', false);
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

// Reading return fixes own exact directed blocks, including the capture-phase
// settings exception. Unknown story edits retain the existing story coverage.
for (const [path, hash, ranges, mutation] of [
  ['js/case-view.js', '2828b862306bd3c0288a830d8ee023c186658b687bef035fe41ca3a6106c4464',
    [['let activeId = null;', 'const frameMaterials = new Map();'], ['function reflect() {', 'new MutationObserver(reflect).observe(mapInspector, {']],
    ['pendingPosition = null;', 'pendingPosition = {};']],
  ['js/panels.js', '6be255860cfca630cb1c8ae14c22e902716ac1b65212aa525c3dd01a05e62bb9',
    [['mapInspector?.querySelector("[data-map-related]")?.addEventListener("click",', 'constellationNavHome?.addEventListener("click",']],
    ['casePosition: position', 'casePosition: null']],
  ['js/map-story.js', '43b66f8b3c313de8a46f70a4203627f7c87bf0ca59c085aa787570cd700bfd1e',
    [['if(h&&c.matches&&r.contains(o.target)', 'if(!a.contains(o.target))']],
    ['&&!o.target.closest("[data-open-settings]")', '&&o.target.closest("[data-open-settings]")']],
  ['rendering/js/map-story.js', '08b3cdd92a3bb4657be65f978b4bea69c86fc8a3b018324b6306bf4deb4c4715',
    [['  if(opened&&compact.matches&&map.contains(event.target)', '  if(!story.contains(event.target))']],
    ["&&!event.target.closest('[data-open-settings]')", "&&event.target.closest('[data-open-settings]')"]],
]) {
  const before = execFileSync('git', ['show', `01693bedbfef368fc88096ce1d9fb307f2cf8b17:${path}`], { cwd: root, encoding: 'utf8' });
  const after = read(path);
  const chunks = ranges.map(([start, end]) => after.slice(after.indexOf(start), after.indexOf(end)));
  const known = ranges.every(([start, end]) => after.indexOf(start) >= 0 && after.indexOf(end) > after.indexOf(start))
    && createHash('sha256').update(chunks.join('\0')).digest('hex') === hash;
  const fallback = path.endsWith('map-story.js') ? ['components', ['map-story']] : ['full', []];
  if (!known) { scoped(path, before, after, ...fallback); continue; }
  const fixture = ranges.map(([start, end], index) => [before.indexOf(start), before.indexOf(end), chunks[index]])
    .sort((left, right) => right[0] - left[0])
    .reduce((source, [start, end, content]) => source.slice(0, start) + content + source.slice(end), before);
  scoped(path, before, fixture, 'components', ['check:case-flow']);
  if (after !== fixture) scoped(path, before, after, ...fallback);
  assert.equal(isCopyOnly(path, before, fixture), false, 'Reading history is behavior, not copy');
  scoped(path, fixture, before, ...fallback);
  for (const changed of [
    fixture.replace(...mutation),
    fixture + '\nglobalThis.unrelated = true;',
    'import "./unrelated.js";\n' + fixture,
    fixture + '\n' + chunks[0],
    'const broken = ;\n' + fixture,
  ]) {
    assert.notEqual(changed, fixture, 'Negative reading-context fixture changes protected code');
    scoped(path, before, changed, ...fallback);
  }
}

// Persistent related posters own their exact template/loader migration only.
// A later implementation must earn a new boundary, not inherit these hashes.
const relatedCoverage = ["check:inspector-links", "check:case-view"];
for (const [path, hash] of [
  ["rendering/js/map-engine.js", "a7a29f11ffd6260b9872f45a5e29120aa096f3d9483cd15f40ea1b620279b41e"],
  ["js/map-engine.js", "6217660eeabc11cc73980fffe7bde91ae0155f9fd4ae1bd6baf01ef7d69c9d74"],
]) {
  const before = execFileSync('git', ['show', `8cecaa4cfaf227ea52d551b1e5b343e317fe8c00:${path}`], { cwd: root, encoding: 'utf8' });
  const after = read(path);
  const start = after.indexOf('const renderMapRelatedItems='), end = after.indexOf('const setInspectorOpen=');
  const known = start >= 0 && end > start && createHash('sha256').update(after.slice(start, end)).digest('hex') === hash;
  scoped(path, before, after, known ? 'components' : 'full', known ? relatedCoverage : []);
  scoped(path, before, after + '\nglobalThis.unrelated = true;', 'full');
  if (known) for (const changed of [
    after.replace('href="?point=${id}"', 'href="?point=changed"'),
    after.replace('loading="lazy" decoding="async" width="72"', 'loading="eager" decoding="async" width="72"'),
    after.replace('const setInspectorOpen=', 'window.addEventListener("click", globalAction);const setInspectorOpen='),
    after + '\n' + after.slice(start, end),
  ]) {
    assert.notEqual(changed, after, 'Negative related-link fixture changes protected code');
    scoped(path, before, changed, 'full');
  }
}
// The caption migration earns one more exact owner pair, not arbitrary
// future renderer code. Its selection and destination bytes stay immutable.
for (const [path, hash] of [
  ["rendering/js/map-engine.js", "d7eb1fd759935ae61d8dfff842b95f5dd90085ebb530d55f51ac4593d1affa98"],
  ["js/map-engine.js", "1fd5d2d3fe9976ab60b29e58129db59c94d317f1afe86d36e7bca6b045bb9079"],
]) {
  const before = execFileSync('git', ['show', `9b093bd11863b1dc7b4ace4b8660c2b938cafcbc:${path}`], { cwd: root, encoding: 'utf8' });
  const after = read(path);
  const start = after.indexOf('const renderMapRelatedItems='), end = after.indexOf('const setInspectorOpen=');
  const known = start >= 0 && end > start && createHash('sha256').update(after.slice(start, end)).digest('hex') === hash;
  scoped(path, before, after, known ? 'components' : 'full', known ? relatedCoverage : []);
  if (known) for (const changed of [
    after.replace('href="?point=${id}"', 'href="?point=changed"'),
    after.replace('relatedCaptions', 'unreviewedCaptions'),
    after + '\nglobalThis.unrelated = true;',
    after + '\n' + after.slice(start, end),
  ]) {
    assert.notEqual(changed, after);
    scoped(path, before, changed, 'full');
  }
}
// The point-art renderer and its two separate links have their own exact pair.
for (const [path, hash] of [
  ['rendering/js/map-engine.js', 'b4a3bd7bb9ea80bd50cb529970eab29009e56ce1d69c1e285ab4f8114c7e38af'],
  ['js/map-engine.js', '5d90729ad4d5f0b578887cdb32eeb04d87e9212e5c72c086715b8448a48ba647'],
]) {
  const before = execFileSync('git', ['show', `b43f05f0cc1a50ef526027d7dacf0fba949ff22b:${path}`], { cwd: root, encoding: 'utf8' });
  const after = read(path), marker = 'const renderMapRelatedItems=', endMarker = 'const setInspectorOpen=';
  const start = after.indexOf(marker), end = after.indexOf(endMarker), block = after.slice(start, end);
  const known = start >= 0 && end > start && createHash('sha256').update(block).digest('hex') === hash;
  if (!known) { scoped(path, before, after, 'full'); continue; }
  const fixture = before.slice(0, before.indexOf(marker)) + block + before.slice(before.indexOf(endMarker));
  scoped(path, before, fixture, 'components', relatedPresentationChecks);
  if (after !== fixture) scoped(path, before, after, 'full');
  scoped(path, fixture, before, 'full');
  for (const changed of [
    fixture.replace(/href="\?point=\$\{[^}]+\}"/, 'href="?point=unrelated"'),
    fixture.replace('relatedActions', 'unreviewedActions'),
    fixture + '\nglobalThis.unrelated = true;',
    fixture + '\n' + block,
    'import "./unrelated.js";\n' + fixture,
  ]) {
    assert.notEqual(changed, fixture);
    scoped(path, before, changed, 'full');
  }
}
for (const media of Object.values(relatedPresentationData.relatedMedia)) for (const path of Object.values(media)) {
  scoped(path, 'previous art', 'reviewed art', 'components', relatedCoverage);
}
scoped('assets/point-thumbnails/unrelated-light.webp', 'before', 'after', 'full');
scoped('assets/point-thumbnails/running-light.svg', 'before', 'after', 'full');
for (const path of ['rendering/README.md', 'docs/point-thumbnails.md']) scoped(path, 'old notes', 'new notes', 'copy');
scoped('rendering/unrelated.js', 'before', 'after', 'full');
scoped('styles.css', '.map-related__track > li + li{border-top:var(--separator-rule)}', '', 'components', relatedCoverage);
scoped('styles.css', '', '.map-related__track > li + .unrelated{color:red}', 'full');
scoped('styles.css', '', '.map-related__track > li + li,.unrelated{color:red}', 'full');
scoped('styles.css', '.map-evidence{border-top:var(--separator-rule)}', '.map-evidence{}', 'components', relatedCoverage);
scoped('styles.css', '', '.map-evidence + .unrelated{color:red}', 'full');
scoped('styles.css', '', 'body:has(.map-evidence){color:red}', 'full');
for (const selector of ['.map-related__item', '.map-related__preview--circle', '.map-related__item:has(.map-related__preview) > :is(strong, span)']) {
  scoped('styles.css', '', `${selector}{align-self:start}`, 'components', relatedCoverage);
}
scoped('styles.css', '', '@container related-projects (min-width:40rem){.map-related__track{column-gap:var(--space-6)}}', 'components', relatedCoverage);
for (const selector of ['body:has(.map-related)', ':is(.map-related__item)', '.map-related__item + .unrelated', '.map-related__preview,.unrelated']) {
  scoped('styles.css', '', `${selector}{color:red}`, 'full');
}
scoped('styles.css', '', '.map-related__preview{width:72px}:root{--material-01:red}', 'full');
const campIconSelector = '.project-orbit-picker [data-picker-project="dd-camp"] .project-atlas-mark';
scoped('styles.css', '', `${campIconSelector}{background:#20469a;color:#fff7ed;box-shadow:none}`, 'components', ['check:hover-layout']);
scoped('styles.css', '', `${campIconSelector},.unrelated{background:#20469a}`, 'full');
scoped('styles.css', '', `${campIconSelector} + .unrelated{background:#20469a}`, 'full');
scoped('styles.css', '', `${campIconSelector}{background:#20469a}:root{--material-01:red}`, 'full');

// Compact overlay context keeps the map's contrast. Only these presentation
// declarations are owned; colors, selectors and breakpoint changes stay full.
const overlayContext = '@container map-viewport (max-width: 900px){.map-surface.has-focused-home.has-constellation-nav .focused-home{opacity:.48;transform:translateY(4px) scale(.97);pointer-events:none}}';
const clearOverlayContext = '@container map-viewport (max-width: 900px){.map-surface.has-focused-home.has-constellation-nav .focused-home{pointer-events:none}}';
const overlayCoverage = ['check:header','check:command-placement','check:accessibility'];
scoped('styles.css', overlayContext, clearOverlayContext, 'components', overlayCoverage);
for (const after of [
  clearOverlayContext + ':root{--material-01:red}',
  clearOverlayContext.replace('pointer-events:none', 'pointer-events:none;background:red'),
  clearOverlayContext.replace('max-width: 900px', 'max-width: 850px'),
  clearOverlayContext.replace('.focused-home{', '.map-grid{'),
  clearOverlayContext + '.project-picker-glass{backdrop-filter:none}',
]) scoped('styles.css', overlayContext, after, 'full');
const frameViewportBefore = 'const f=()=>{ viewport.height = visual?.height || innerHeight; };';
const frameViewportAfter = 'const f=()=>{ const frameInset = parseFloat(getComputedStyle(document.getElementById("split-shell")).paddingBottom) || 0;\n    viewport.height = Math.max(0, Math.min(viewport.top + (visual?.height || innerHeight), innerHeight - frameInset) - viewport.top); };';
for (const path of ['js/viewport-ui.js','rendering/js/viewport-ui.js']) {
  scoped(path, frameViewportBefore, frameViewportAfter, 'components', ['check:command-placement']);
  scoped(path, frameViewportBefore, frameViewportAfter + '\nglobalThis.unrelated=1;', 'full');
  scoped(path, frameViewportBefore, frameViewportAfter.replace('innerHeight - frameInset','innerHeight + frameInset'), 'full');
}

// A compact Work panel can use its existing window edge when its dock is hidden.
const compactWorkInset = '@container map-viewport (max-width: 900px){.content-panel[data-view="work"]{--panel-bottom:var(--window-edge)}}';
scoped('styles.css', '', compactWorkInset, 'components', ['check:first-visit']);
for (const after of [
  compactWorkInset.replace('data-view="work"', 'data-view="contact"'),
  compactWorkInset.replace('[data-view="work"]', ''),
  compactWorkInset.replace('--panel-bottom', '--panel-frame-top'),
  compactWorkInset.replace('var(--window-edge)', 'var(--window-gap)'),
  compactWorkInset.replace('var(--window-edge)', 'var(--window-edge)!important'),
  compactWorkInset.replace('max-width: 900px', 'max-width: 901px'),
  compactWorkInset.replace('@container map-viewport', '@media'),
  compactWorkInset.replace('--panel-bottom:var(--window-edge)', '--panel-bottom:var(--window-edge);opacity:.5'),
  compactWorkInset + '.map-grid{opacity:0}',
]) scoped('styles.css', '', after, 'full');
for (const engine of ['chromium', 'webkit']) assert.deepEqual(
  new Set(browserMatrix('components', ['check:first-visit']).include.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))),
  new Set(['first-visit']), 'Compact Work inset retains the existing entry, case return, and last-row keyboard checks');

// Only the reviewed desktop thumbnail width belongs to this visual follow-through.
const workPreviewBefore = '@container map-viewport (min-width:901px){.content-panel img.work-row__preview{grid-column:2;grid-row:1;width:min(100%,20rem,30cqh);margin-bottom:var(--space-3)}}';
const workPreviewAfter = workPreviewBefore.replace('min(100%,20rem,30cqh)', 'min(100%,22rem,35cqh)');
scoped('styles.css', workPreviewBefore, workPreviewAfter, 'components', ['check:first-visit']);
for (const after of [
  workPreviewAfter.replace('min-width:901px', 'min-width:800px'),
  workPreviewAfter.replace('map-viewport', 'other-viewport'),
  workPreviewAfter.replace('img.work-row__preview', 'img.unrelated'),
  workPreviewAfter.replace('min(100%,22rem,35cqh)', 'min(100%,24rem,40cqh)'),
  workPreviewAfter.replace('grid-column:2', 'grid-column:1'),
  workPreviewAfter.replace('width:min', 'object-fit:cover;width:min'),
  workPreviewAfter + '.work-list{grid-template-columns:1fr}',
]) scoped('styles.css', workPreviewBefore, after, 'full');
const mixedRelatedBefore = '.map-related__item:has(.map-related__preview){grid-template-columns:min(4.5rem,25%) minmax(0,1fr)}';
const mixedRelatedAfter = '.map-related__track:has(.map-related__preview) .map-related__item{grid-template-columns:min(4.5rem,25%) minmax(0,1fr)}';
scoped('styles.css', workPreviewBefore + mixedRelatedBefore, workPreviewAfter + mixedRelatedAfter, 'components', ['check:first-visit', ...relatedCoverage]);

// The known picker migration owns only the two plane construction blocks.
const pickerSourceBefore = "function init(){\n    preview.prepend(pickerGlass);\n    const sizePickerHead=()=>{if(!picker.hidden)preview.style.setProperty('--picker-head-height',`${pickerHead.getBoundingClientRect().height}px`);};\n    new ResizeObserver(sizePickerHead).observe(pickerHead);\n\n      pickerGlass.hidden=!selected;preview.dataset.materialActive=selected?'none':'always';\n      if(selected){pickerHead.dataset.materialSurface='project-picker-header';pickerHead.dataset.materialActive='always';sizePickerHead();}\n      else{delete pickerHead.dataset.materialSurface;delete pickerHead.dataset.materialActive;}\n\n}";
const pickerSourceAfter = "function init(){\n    const headerGlass=pickerGlass.cloneNode();headerGlass.classList.add('project-picker-glass--header');headerGlass.dataset.materialSurface='project-picker-header';headerGlass.dataset.materialActive='always';\n    const glassClip=glass=>{const clip=doc.createElement('div');clip.className='project-picker-clip';clip.append(glass);return clip;};\n    const headerClip=glassClip(headerGlass);headerClip.classList.add('project-picker-clip--header');\n    preview.prepend(glassClip(pickerGlass),headerClip);\n    const sizePickerHead=()=>{if(!picker.hidden){preview.style.setProperty('--picker-head-height',`${pickerHead.getBoundingClientRect().height}px`);preview.style.setProperty('--picker-height',`${preview.clientHeight}px`);}};\n    const pickerSize=new ResizeObserver(sizePickerHead);pickerSize.observe(pickerHead);pickerSize.observe(preview);\n\n      pickerGlass.hidden=headerGlass.hidden=!selected;preview.dataset.materialActive=selected?'none':'always';\n      if(selected)sizePickerHead();\n\n}";
scoped('rendering/practice-orbits.js', pickerSourceBefore, pickerSourceAfter, 'components', ['check:hover-layout']);
for (const after of [pickerSourceAfter + '\nglobalThis.unrelated=1;', pickerSourceAfter.replace('project-picker-header','different-material'), 'const broken = ;' + pickerSourceAfter]) {
  scoped('rendering/practice-orbits.js', pickerSourceBefore, after, 'full');
}
// The released baseline is immutable and available to Quality's full-history
// checkout. Once a later release changes this runtime, it must classify full.
const pickerRuntimeBefore = execFileSync('git', ['show','e65048f8bb842a6ca246394d8c620c31d36fd658:js/practice-orbits.js'], {cwd:root,encoding:'utf8'});
const pickerRuntimeAfter = read('js/practice-orbits.js');
const knownPickerRuntime = createHash('sha256').update(pickerRuntimeAfter).digest('hex') === '00c9771fcb854428009aed1b5d72d06458bc5242f89a1a4ca48fa6aa0cd94b33';
scoped('js/practice-orbits.js', pickerRuntimeBefore, pickerRuntimeAfter, knownPickerRuntime ? 'components' : 'full', knownPickerRuntime ? ['check:hover-layout'] : []);
scoped('js/practice-orbits.js', pickerRuntimeBefore, pickerRuntimeAfter + '\nglobalThis.unrelated=1;', 'full');
const pickerContourBefore = '.project-picker-glass{position:absolute;inset:var(--picker-head-height) 0 0;z-index:0;border-radius:0 0 var(--window-radius) var(--window-radius);corner-shape:var(--corner-card-shape);clip-path:border-box;pointer-events:none}';
const pickerContourAfter = ".project-picker-clip{position:absolute;inset:var(--picker-head-height) 0 0;overflow:hidden;z-index:0;pointer-events:none}.project-picker-clip--header{inset:0 0 auto;height:var(--picker-head-height);z-index:2}.project-picker-glass{position:absolute;inset:calc(-1 * var(--picker-head-height)) 0 0;border-radius:var(--window-radius);corner-shape:var(--corner-card-shape);pointer-events:none}.project-picker-glass--header{inset:0 0 auto;height:var(--picker-height)}";
scoped('styles.css', pickerContourBefore, pickerContourAfter, 'components', ['check:hover-layout']);
scoped('styles.css', pickerContourBefore, pickerContourAfter + '.project-picker-glass{background:red}', 'full');
scoped('styles.css', pickerContourBefore, pickerContourAfter.replace('overflow:hidden','overflow:visible'), 'full');

const styles = read("styles.css");
for (const selector of ['#story-bridge button', '#story-bridge button::before', '.has-story-pane #story-bridge', '#story-bridge button:hover::before,#story-bridge button:focus-visible::before']) {
  scoped('styles.css', '', `${selector}{opacity:.8}`, 'components', ['story-bridge']);
}
scoped('styles.css', '', '@media(max-width:999px){#story-bridge button::before{width:32px}}', 'components', ['story-bridge']);
for (const selector of ['#story-bridge + #story-pane', ':is(#story-bridge,#map-pane)', 'body:has(#story-bridge)', '#story-bridge button,#map-pane', '#split-shell']) {
  scoped('styles.css', '', `${selector}{opacity:.8}`, 'full');
}
scoped('styles.css', '', '#story-bridge button{opacity:.8}:root{--line:red}', 'full');
assert.deepEqual(componentCoverage['story-bridge'], ['map-story', 'accessibility']);

// The system-color priority repair cannot change the normal material or escape its media condition.
const forcedMaterial = `@media (forced-colors: active){
[data-material-surface] {
border: 1px solid CanvasText;
background: Canvas;
box-shadow: none;
backdrop-filter: none;
-webkit-backdrop-filter: none;
}}`;
const forcedMaterialPriority = forcedMaterial.replaceAll(';', ' !important;');
scoped('styles.css', forcedMaterial, forcedMaterialPriority, 'components', ['check:core','check:accessibility']);
scoped('styles.css', forcedMaterialPriority, forcedMaterial, 'full');
scoped('styles.css', forcedMaterial, forcedMaterialPriority + ':root{--material-01:#fff}', 'full');
scoped('styles.css', forcedMaterial, forcedMaterialPriority.replace('CanvasText','red'), 'full');
scoped('styles.css', forcedMaterial.replace('forced-colors: active','prefers-color-scheme: dark'), forcedMaterialPriority.replace('forced-colors: active','prefers-color-scheme: dark'), 'full');
assert.equal(browserMatrix('components',['check:core','check:accessibility']).include.length,7);
// Moving only passive version text does not broaden to unrelated map/media checks.
const versionBefore = '<!doctype html>\n<div class="constellation-nav__utilities">\n</div>\n<div class="display-control">\n</div>\n<div class="settings-panel__body">\n<p class="settings-panel__version" data-site-version>Версия 1.366</p>\n</div>\n';
const versionAfter = versionBefore.replace('<div class="constellation-nav__utilities">\n', '<div class="constellation-nav__utilities">\n<p class="site-version site-version--menu" data-site-version>Версия 2.97</p>\n')
  .replace('<div class="display-control">\n', '<div class="display-control">\n<p class="site-version site-version--display" data-site-version>Версия 2.97</p>\n')
  .replace('<p class="settings-panel__version" data-site-version>Версия 1.366</p>\n', '');
scoped('index.html', versionBefore, versionAfter, 'components', ['check:accessibility']);
for (const unsafe of [versionAfter.replace('data-site-version>', 'data-site-version onclick="alert(1)">'), versionAfter.replace('class="display-control"', 'class="another-panel"'), versionAfter.replace('Версия 2.97</p>', 'Версия <a href="/">2.97</a></p>'), versionAfter + '<script>run()</script>']) scoped('index.html', versionBefore, unsafe, 'full');
scoped('styles.css', '.settings-panel__version { color: gray; }', '.site-version { color: gray; }', 'components', ['check:accessibility']);
const presenceLine = '<p class="display-control__presence" data-presence hidden>Сейчас на сайте <span data-presence-count>1</span></p>\n';
const rowBefore = versionBefore.replace('<div class="display-control">\n', '<div class="display-control">\n' + presenceLine);
const rowAfter = versionAfter.replace('<div class="display-control">\n', '<div class="display-control">\n<div class="display-control__status">\n' + presenceLine)
  .replace('<p class="site-version site-version--display" data-site-version>Версия 2.97</p>\n', '<p class="site-version site-version--display" data-site-version>Версия 2.97</p>\n</div>\n');
scoped('index.html', rowBefore, rowAfter, 'components', ['check:accessibility']);
assert.equal(browserMatrix('components', ['check:accessibility']).include.length, 2);
// Index-only background paint cannot classify a neighbouring surface.
scoped('styles.css', '', '.map-surface.has-command-focus .map-labels {visibility:visible}', 'components', ['check:command-placement']);
scoped('styles.css', '', '@container map-viewport (max-width:900px){.map-surface.has-command-focus{--command-background-opacity:.48}}', 'components', ['check:command-placement']);
scoped('styles.css', '', '.map-surface.has-command-focus + .map-labels {visibility:visible}', 'full');
scoped('styles.css', '', '.map-surface.has-command-focus .map-labels,.map-labels {visibility:visible}', 'full');
// Small map controls keep their semantic attributes and surrounding code.
const returnBefore = "<button type=\"button\" class=\"focused-return\" data-focused-return><span aria-hidden=\"true\">←</span> Опорные точки</button>";
const returnAfter = "<button type=\"button\" class=\"focused-return\" data-focused-return><svg class=\"focused-return__icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 12h15M13 5l7 7-7 7\"/></svg> Опорные точки</button>";
scoped('index.html', returnBefore, returnAfter, 'components', ['header']);
scoped('index.html', returnBefore, returnAfter.replace('focusable="false"', 'onclick="run()"'), 'full');
const aboutBefore = '<!doctype html>\n<a id="map-about-trigger" class="map-disclosure map-about-trigger" href="?story=1" aria-controls="story-pane" aria-expanded="false"><span>О КАРТЕ</span></a>';
const aboutAfter = aboutBefore.replace('<span>', '<svg class="map-about-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6.5C9.5 4.8 6.5 4.3 3 5v14c3.5-.7 6.5-.2 9 1.5 2.5-1.7 5.5-2.2 9-1.5V5c-3.5-.7-6.5-.2-9 1.5Zm0 0v14"/></svg>' + '<span>');
scoped('index.html', aboutBefore, aboutAfter, 'components', ['check:accessibility']);
const rowsBefore = '            <div\n              class="map-control-group map-control-group--coordinates"><button data-time-toggle>ХРОНОЛОГИЯ</button></div>\n' + aboutAfter + '\n';
const rowsAfter = '            <div class="map-control-group map-control-group--secondary">\n' + rowsBefore + '            </div>\n';
scoped('index.html', rowsBefore, rowsAfter, 'components', ['check:accessibility']);
scoped('index.html', rowsBefore, rowsAfter.replace('--secondary"', '--secondary" onclick="run()"'), 'full');
scoped('index.html', rowsBefore, rowsAfter.replace('data-time-toggle', 'data-other-toggle'), 'full');
const filtersBeforeRows = '<div class="map-control-group map-control-group--filters"><button>ВСЁ</button></div>\n';
scoped('index.html', filtersBeforeRows + rowsBefore, rowsAfter.replace(rowsBefore, filtersBeforeRows + rowsBefore), 'full');


for (const unsafe of [aboutAfter.replace('href="?story=1"', 'href="?story=2"'), aboutAfter.replace('class="map-about-trigger__icon"', 'class="map-about-trigger__icon" onclick="run()"'), aboutAfter+'<script>run()</script>']) scoped('index.html', aboutBefore, unsafe, 'full');

scoped('index.html', rowBefore, rowAfter.replace('class="display-control__status"', 'class="display-control__status" onclick="run()"'), 'full');
scoped('index.html', rowBefore, rowAfter.replace('data-presence hidden', 'data-presence hidden onclick="run()"'), 'full');



// A paint-only removal keeps all geometry and the common material untouched.
const materialCopy = '.command-results{padding:16px;background:var(--material-01);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}';
const materialShared = '.command-results{padding:16px}';
scoped('styles.css', materialCopy, materialShared, 'components', ['materials']);
scoped('styles.css', materialCopy, '.command-results{padding:8px}', 'full');
scoped('styles.css', materialCopy, materialShared + ':root{--material-01:#fff}', 'full');
scoped('styles.css', materialCopy, materialShared + '.command-results:hover{background:var(--material-01)!important}', 'full');
scoped('styles.css', '.unknown{background:var(--material-01)}', '', 'full');
const mobileRegistry = '@container map-viewport (max-width: 900px){\n[data-material-surface][data-material-active="mobile"]{border:0;background: var(--material-01);box-shadow:none;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);}}';
const guardedMobileRegistry = mobileRegistry.replace('mobile"]', 'mobile"]:not(.is-content-stack-hidden)');
scoped('styles.css', mobileRegistry, guardedMobileRegistry, 'components', ['materials']);
scoped('styles.css', materialCopy + mobileRegistry, materialShared + guardedMobileRegistry, 'components', ['materials']);
scoped('styles.css', guardedMobileRegistry, mobileRegistry, 'full');
scoped('styles.css', mobileRegistry, guardedMobileRegistry.replace('900px','899px'), 'full');
scoped('styles.css', mobileRegistry, guardedMobileRegistry.replace('24px','12px'), 'full');
scoped('styles.css', mobileRegistry, guardedMobileRegistry.replace('mobile','desktop'), 'full');
scoped('styles.css', mobileRegistry, guardedMobileRegistry.replace('is-content-stack-hidden','other-state'), 'full');
// A shared recipe changes painting only; geometry, state and local overrides stay full.
const tintBefore = ':root{--material-01:rgba(255,255,255,0.5)}[data-material-surface][data-material-active="always"]{background:var(--material-01);box-shadow:none;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}';
const tintAfter = ':root{--material-01:rgba(246,248,242,0.4);--material-01-backdrop:blur(24px) saturate(1.35);--material-01-shadow:inset 0 1px 0 rgba(255,255,255,.55), inset 0 0 0 1px rgba(255,255,255,.24), 0 4px 16px rgba(24,30,20,.06)}[data-material-surface][data-material-active="always"]{background:var(--material-01);box-shadow:var(--material-01-shadow);backdrop-filter:var(--material-01-backdrop);-webkit-backdrop-filter:var(--material-01-backdrop)}';
scoped('styles.css',tintBefore,tintAfter,'components',['materials']);
scoped('styles.css',tintBefore,tintAfter.replace('1.35','1.9'),'full');
scoped('styles.css',tintBefore,tintAfter.replace('box-shadow:var','padding:1px;box-shadow:var'),'full');
scoped('styles.css',tintBefore,tintAfter.replace('always','mobile'),'full');
scoped('styles.css',tintBefore,tintAfter.replace('0.4)','0.4)!important'),'full');
scoped('styles.css',tintBefore,tintAfter+'.settings-panel{--material-01:#fff}','full');
scoped('styles.css',tintBefore,tintAfter.replace('--material-01-backdrop:','--material-01:rgba(246,248,242,0.4);--material-01-backdrop:'),'full');
scoped('styles.css','@container map-viewport (max-width:900px){'+tintBefore+'}','@container map-viewport (max-width:899px){'+tintAfter+'}','full');
const pointerBefore = "  const records = new Map();\n  let frame = 0;\n    region.style.removeProperty(\"--scroll-ink-filter\");\n    if (region.parentElement !== textFrame)\n      if (!textFrame && !region.querySelector(\"iframe\")) {\n        const style=getComputedStyle(region);\n  region.addEventListener(\"focusin\", schedule);\n  region.addEventListener(\"focusout\", schedule);";
const pointerAfter = "  const records = new Map();\n  const pressedPointers = new Set();\n  let frame = 0;\n    region.style.removeProperty(\"--scroll-ink-filter\");\n    if (pressedPointers.size) return;\n    if (region.parentElement !== textFrame)\n      if (!textFrame && !region.querySelector(\"iframe\")) {\n        if (pressedPointers.size) return;\n        const style=getComputedStyle(region);\n  // WebKit cancels click if the pressed control is reparented before pointerup.\n  region.addEventListener(\"pointerdown\", event => pressedPointers.add(event.pointerId), { capture: true, passive: true });\n  const releasePointer = event => { if (pressedPointers.delete(event.pointerId)) schedule(); };\n  window.addEventListener(\"pointerup\", releasePointer, { capture: true, passive: true });\n  window.addEventListener(\"pointercancel\", releasePointer, { capture: true, passive: true });\n  const releasePointers = () => { if (pressedPointers.size) { pressedPointers.clear(); schedule(); } };\n  window.addEventListener(\"blur\", releasePointers);\n  window.addEventListener(\"pagehide\", releasePointers);\n  region.addEventListener(\"focusin\", schedule);\n  region.addEventListener(\"focusout\", schedule);";
for (const path of ['js/viewport-ui.js','rendering/js/viewport-ui.js']) {
  scoped(path,pointerBefore,pointerAfter,'components',['scroll-lens-pointer']);
  scoped(path,pointerAfter,pointerBefore,'full');
  scoped(path,pointerBefore,pointerAfter.replace('pressedPointers.size','false'),'full');
  scoped(path,pointerBefore,pointerAfter.replace('pointerup','pointermove'),'full');
  scoped(path,pointerBefore,pointerAfter+'\nrunOtherBehavior();','full');
}
assert.equal(browserMatrix('components',['materials','scroll-lens-pointer']).include.length,11);
const auditFixture = 'const readMaterialAuditExpression = `old`;\nconst unchanged = 1;';
const menuFooterBefore = '@container map-viewport (max-width: 900px){.control-console .constellation-nav.is-open .constellation-nav__orbit{padding:0 8px 4px}.site-version--menu{margin-top:var(--space-2)}}';
const menuFooterAfter = menuFooterBefore.replace('padding:0 8px 4px', 'padding:0 8px var(--space-4)').replace('margin-top:var(--space-2)', 'margin-top:0');
scoped('styles.css', menuFooterBefore, menuFooterAfter, 'components', ['check:accessibility']);
scoped('styles.css', menuFooterBefore, menuFooterAfter.replace('padding:0 8px var(--space-4)', 'padding:0 8px 48px'), 'full');
scoped('styles.css', menuFooterBefore, menuFooterAfter.replace('max-width: 900px', 'max-width: 899px'), 'full');
scoped('styles.css', menuFooterBefore, menuFooterAfter + ' .unrelated{padding:16px}', 'full');

const submitEmpty = '<span class="command-dock__submit-mark" aria-hidden="true"></span>';
const submitArrow = '<span class="command-dock__submit-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 12h15M13 5l7 7-7 7"/></svg></span>';
scoped('index.html', submitEmpty, submitArrow, 'components', ['check:command-placement']);
scoped('index.html', submitEmpty, submitArrow.replace('focusable="false"', 'onload="run()"'), 'full');
scoped('index.html', submitEmpty, submitArrow + '<script>run()</script>', 'full');
scoped('styles.css', '', '.command-dock__submit-mark svg{stroke-width:1.5}', 'components', ['check:command-placement']);
scoped('styles.css', '', '.command-dock__submit-mark + .unrelated{color:red}', 'full');
scoped('styles.css', '', '.nav-external,.contact-links a::after,.map-readout__destination[target="_blank"]::after{width:1cap}', 'components', ['check:accessibility','check:inspector-links']);
scoped('styles.css', '', '.map-readout__destination,.unrelated{color:red}', 'full');

const separatorBefore = ':root{} .map-related__track > li + li{border-top:1px solid var(--line-soft)}';
const separatorAfter = ':root{--separator-rule:1px solid var(--line-soft);--separator-edge:1px solid var(--line);--separator-control-before:var(--space-2);--separator-control-after:0px;--separator-row-compact:var(--space-3);--separator-row-regular:var(--space-4);--separator-row-roomy:var(--space-5);--separator-section-before:var(--space-5);--separator-section-after:var(--space-4);} .map-related__track > li + li{border-top:var(--separator-rule)}';
scoped('styles.css', separatorBefore, separatorAfter, 'components', ['check:accessibility', 'check:case-view']);
scoped('styles.css', separatorBefore, separatorAfter.replace('--separator-section-after:var(--space-4)', '--separator-section-after:100px'), 'full');
scoped('styles.css', separatorBefore, separatorAfter.replace('border-top:var(--separator-rule)', 'border-top:var(--separator-rule)!important'), 'full');
scoped('styles.css', separatorBefore, separatorAfter.replace('.map-related__track > li + li', '.map-related__track + .unrelated'), 'full');
scoped('styles.css', separatorBefore, separatorAfter + ' .unrelated{padding:10px}', 'full');
const separatorContrastBefore = ' @media (prefers-contrast: more){.map-surface{--line:rgba(16,17,15,.36);--line-soft:rgba(16,17,15,.2)}} @media (prefers-color-scheme: dark){.no-script-fallback{--line:rgba(242,241,236,.18)}}';
const separatorContrastAfter = separatorContrastBefore.replace('--line-soft:rgba(16,17,15,.2)', '--line-soft:rgba(16,17,15,.2);--separator-rule:1px solid var(--line-soft);--separator-edge:1px solid var(--line)').replace('--line:rgba(242,241,236,.18)', '--line:rgba(242,241,236,.18);--separator-edge:1px solid var(--line)');
scoped('styles.css', separatorBefore + separatorContrastBefore, separatorAfter + separatorContrastAfter, 'components', ['check:accessibility', 'check:case-view']);
scoped('styles.css', separatorBefore + separatorContrastBefore, separatorAfter + separatorContrastAfter.replace('prefers-contrast: more', 'prefers-contrast: less'), 'full');
scoped('styles.css', separatorBefore + separatorContrastBefore, separatorAfter + separatorContrastAfter.replace('--separator-edge:1px solid var(--line)', '--separator-edge:1px solid red'), 'full');


const depthAuditFixture = 'const readMaterialAuditExpression = `const backgroundDepth = element.matches("body.has-command-focus .site-header") || (mobile && element.matches(\n        "body.has-content-panel .control-console :is(.constellation-nav, .command-dock)",\n      ));`;';
const compactDepthAudit = depthAuditFixture
  .replace('const backgroundDepth = element.matches(', 'const backgroundDepth = !(mobile && element.matches(".map-surface.has-command-focus .site-header")) && (element.matches(')
  .replace('      ));', '      )));');
scoped('scripts/browser-contracts.cjs', depthAuditFixture, compactDepthAudit, 'components', ['check:command-placement']);
scoped('scripts/browser-contracts.cjs', depthAuditFixture, compactDepthAudit.replace('.map-surface.has-command-focus', '.map-surface'), 'components', ['materials']);
scoped('scripts/browser-contracts.cjs', depthAuditFixture, compactDepthAudit + '\nrunOtherBehavior();', 'full');

scoped('scripts/browser-contracts.cjs', auditFixture, auditFixture.replace('`old`','`new`'), 'components', ['materials']);
scoped('scripts/browser-contracts.cjs', auditFixture, auditFixture.replace('= 1','= 2'), 'full');
assert.equal(browserMatrix('components',['materials']).include.length,11);

scoped('styles.css', '', '#story-pane .opening{padding-top:24px}', 'components', ['map-story']);
scoped('styles.css', '', '#story-pane + #map-pane{opacity:0}', 'full');
scoped('styles.css', '', '#story-pane .opening{padding-top:24px}#map-pane{opacity:0}', 'full');
scoped('js/map-story.js', 'before', 'after', 'components', ['map-story']);
const storyCopyFixture = '<section id="story"><p>Рассказ</p><a href="?point=running" aria-label="Открыть бег">Бег</a></section>';
scoped('assets/map-story/content.html', storyCopyFixture, storyCopyFixture.replace('Рассказ', 'История карты').replace('Открыть бег', 'О беге'), 'copy');
scoped('assets/map-story/content.html', storyCopyFixture, storyCopyFixture.replace('?point=running', '?point=dusty'), 'components', ['map-story']);
scoped('assets/map-story/content.html', storyCopyFixture, storyCopyFixture.replace('<p>Рассказ</p>', '<button>Рассказ</button>'), 'components', ['map-story']);
scoped('assets/map-story/black-hole.js', 'before', 'after', 'full');
scoped('js/viewport-ui.js', 'before', 'after', 'full');
assert.deepEqual(componentCoverage['map-story'], ['map-story', 'scroll-lens', 'accessibility']);
scoped("styles.css", "", '.control-console .command-dock__mark svg {fill: none; stroke: currentColor}', "components", ["search-icon"]);
scoped("styles.css", '.control-console .command-dock__mark::before {content: ""}', "", "components", ["search-icon"]);
scoped("styles.css", "", '.control-console .command-dock__mark svg, .map-node {fill: none}', "full");
scoped("styles.css", "", '.control-console .command-dock__mark + input {display: none}', "full");
for (const selector of ['.site-header', '.focused-home .site-header[data-material-surface]', '.brand__role', '.site-header .whoop-foot', '.whoop-readout[data-unavailable="true"] .whoop-stamp']) {
  scoped('styles.css', '', `${selector} {padding: 12px; color: var(--content-ink)}`, 'components', ['header']);
}
scoped('styles.css', '', '.site-header {padding: 12px}\n.command-dock__mark svg {fill: none}', 'components', ['header', 'search-icon']);
scoped('styles.css', '', '@media(max-width:900px){.site-header {padding: 12px}}', 'components', ['header']);
scoped('styles.css', '', '@container map-viewport (max-width:900px){.site-header {padding: 12px}}', 'components', ['header']);
scoped('styles.css', '', '@container map-viewport (max-width:900px){.site-header {padding: 12px}.map-grid {opacity:0}}', 'full');
scoped('styles.css', '@container map-viewport (max-width:900px){.map-grid {opacity:1}}', '@container map-viewport (max-width:800px){.map-grid {opacity:1}}', 'full');
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
scoped("styles.css", "@media(min-width: 900px){.map-grid {opacity: 1}}", "@media(min-width: 800px){.map-grid {opacity: 1}}", "full");
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
const retainedChecks = ["map-story", "signature", "case-flow", "personal-media", "inspector-links", "point-address", "accessibility", "map-routes", "hover-layout", "whoop-ui", "first-visit", "command-placement", "header", "search-icon", "sphere-motion", "case-view", "scroll-lens", "observation-route"];
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

// New owners prove actual boundaries; shared code, syntax errors and unknown
// test helpers still select the complete suite.
for (const path of ['js/panels.js', 'js/map-media.js', 'js/observation-route.js']) {
  const before = read(path);
  const needle = path === 'js/panels.js' ? 'requestAnimationFrame(() => mapOverview.focus({ preventScroll: true }))'
    : path === 'js/map-media.js' ? 'observationVideo.hidden = false' : 'duration: 20000';
  const after = before.replace(needle, path === 'js/panels.js' ? 'requestAnimationFrame(() => mapOverview.focus())'
    : path === 'js/map-media.js' ? 'observationVideo.hidden = true' : 'duration: 21000');
  assert.notEqual(before, after);
  scoped(path, before, after, 'components', ['overview']);
  scoped(path, before, after + '\nwindow.addEventListener("unrelated", () => {});', 'full');
  scoped(path, before, 'import "./unrelated.js";\n' + after, 'full');
  scoped(path, before, after + '\nconst broken = ;', 'full');
}
const mediaSource = read('js/map-media.js');
scoped('js/map-media.js', mediaSource, mediaSource.replace('const pauseReelMosaic = () => {', 'const pauseReelMosaic = () => { previewHideTimer = 1;'), 'full');
scoped('js/panels.js', panels, panels.replace('const openPointFromContentPanel = (pointId, sourceRow = null)', 'const openPointFromContentPanel = (pointId, sourceRow = document.body)'), 'full');
scoped('styles.css', '', '.overview-entry {padding: 12px}', 'components', ['overview']);
scoped('styles.css', '', '.observation-video {opacity: .9}', 'components', ['overview']);
scoped('styles.css', '', '.map-node {will-change: filter}', 'components', ['map-presentation']);
for (const selector of ['.overview-entry + .map-grid', ':has(.overview-entry)', '.observation-video, .map-grid', '.map-node + .control-console']) {
  scoped('styles.css', '', `${selector} {opacity: 0}`, 'full');
}
const entry = '<button type="button" class="overview-entry" data-start-map-observation>Посмотреть обзор · 3 минуты</button>';
assert(html.includes(entry));
scoped('index.html', html.replace(entry, ''), html, 'components', ['overview']);
const interior = html.replace('data-start-observation>Посмотреть', 'data-start-observation><span aria-hidden="true">→</span>Посмотреть');
scoped('index.html', html, interior, 'components', ['overview']);
for (const changed of [interior.replace('data-start-observation>', 'data-start-observation onclick="run()">'),
  interior.replace('data-start-observation>', 'data-start-observation><script>run()</script>'),
  interior.replace('class="work-overview"', 'class="unrelated"'),
  html.replace(entry, entry + entry), html.replace('class="map-camera"', 'class="elsewhere"')]) {
  scoped('index.html', html, changed, 'full');
}
const notFound = read('404.html');
scoped('404.html', notFound, notFound.replace('margin: 1rem 0 0', 'margin: 2rem 0 0'), 'components', ['not-found']);
scoped('404.html', notFound, notFound.replace('let paused = false', 'let paused = true'), 'full');
scoped('404.html', notFound, notFound.replace('class="not-found__copy"', 'class="not-found__copy" onclick="run()"'), 'full');
for (const id of ['observation-route', 'first-visit', 'case-flow', 'accessibility']) {
  scoped(`scripts/check-${id}.mjs`, 'before', 'after', 'components', [`check:${id}`]);
  for (const engine of ['chromium', 'webkit']) assert.deepEqual(browserMatrix('components', [`check:${id}`]).include
    .filter(job => job.browser === engine).flatMap(job => job.checks.split(',')), [id]);
}
scoped('scripts/audit-project.mjs', 'before', 'after', 'copy');
scoped('scripts/browser-contracts.cjs', 'before', 'after', 'full');
scoped('scripts/unregistered-check.mjs', 'before', 'after', 'full');

// The actual caption move is local even inside map-engine.js. A nearby change
// to node placement, relationships or an executable offset remains full scope.
const mapEngine = read('js/map-engine.js');
// Solid-radius work is owned by the map; neighbouring code is not exempted.
const geometryChanged = mapEngine.replace('centerY:rect.top+rect.height/2-bounds.top,radius:getMapCoreRadius(glyph)', 'centerY:rect.top+rect.height/2-bounds.top,radius:getMapCoreRadius(glyph)*.99');
assert.notEqual(geometryChanged, mapEngine);
scoped('js/map-engine.js', mapEngine, geometryChanged, 'components', ['map-presentation']);
const coreBefore = 'const mapButtons = new Map(); if (mapLinksRoot) { const getNodeGeometry = item => ({radius:item.size/2}); } export {mapButtons};';
const coreAfter = 'const getMapCoreRadius = glyph => glyph.clientWidth/2; const mapButtons = new Map(); if (mapLinksRoot) { const getNodeGeometry = item => ({radius:getMapCoreRadius(item)}); new MutationObserver(scheduleMapLinksRender).observe(mapButtons.get("garage"),{attributes:true,attributeFilter:["data-gravity-ready"]});matchMedia("(forced-colors:active)").addEventListener("change",scheduleMapLinksRender); } export {getMapCoreRadius,mapButtons};';
scoped('js/map-engine.js', coreBefore, coreAfter, 'components', ['map-presentation']);
for (const after of [
  coreAfter.replace('attributeFilter:["data-gravity-ready"]', 'attributeFilter:["style"]'),
  coreAfter.replace('"(forced-colors:active)"', '"(min-width:1px)"'),
  coreAfter.replace('export {getMapCoreRadius,mapButtons}', 'export {getMapCoreRadius,mapButtons,newAPI}'),
  coreAfter.replace('const mapButtons = new Map()', 'const mapButtons = new Map([[1,2]])'),
  coreAfter + '\nimport "./new-global.js";',
  coreAfter + '\nwindow.addEventListener("click", globalAction);',
  coreAfter.replace('glyph.clientWidth/2', 'import("./new-global.js")'),
  coreAfter.replace('if (mapLinksRoot)', 'if (unrelatedRoot)'),
]) scoped('js/map-engine.js', coreBefore, after, 'full');
for (const after of [
  geometryChanged.replace('const duration = shouldMorph ? 440 : 320', 'const duration = shouldMorph ? 600 : 400'),
  geometryChanged.replace('const glyphDiameter = Math.max(10, item.size * glyphScale)', 'const glyphDiameter = Math.max(20, item.size * glyphScale)'),
]) scoped('js/map-engine.js', mapEngine, after, 'full');
for (const path of ['rendering/js/spatial-home.js', 'js/spatial-home.js']) {
  const source = read(path);
  scoped(path, source, source + '\nconst localGeometryAdjustment = 1;', 'components', ['map-presentation']);
  for (const after of [source + '\nimport "./new-global.js";', source + '\nimport("./new-global.js");', source + '\nexport const newAPI = 1;']) scoped(path, source, after, 'full');
}
// A resize-only scene guard cannot change original navigation or global input.
const sceneRestoreChecks = ['check:map-routes', 'check:first-visit'];
const sceneRestoreBefore = `function restoreScene() {
  if (restoring) return;
  stopSceneMotion();
  restoring = true;
  setScene(location.hash === '#map');
  restoring = false;
}
window.addEventListener('popstate', restoreScene);
compact.addEventListener('change', restoreScene);
window.addEventListener('resize', syncMeasurements);`;
const sceneRestoreAfter = sceneRestoreBefore.replace('restoreScene()', 'restoreScene(event)')
  .replace('  stopSceneMotion();', `  stopSceneMotion();
  const responsive = event?.type === 'change';
  const revision = sceneRevision;
  if (responsive) {
    document.body.classList.add('is-map-switching');
    pane.syncState();
  }`)
  .replace('  restoring = false;', `  restoring = false;
  if (responsive) requestAnimationFrame(() => requestAnimationFrame(() => {
    if (revision !== sceneRevision) return;
    document.body.classList.remove('is-map-switching');
    pane.syncState();
  }));`)
  .replace("window.addEventListener('resize', syncMeasurements);", "window.addEventListener('resize', () => { pane.refresh(); syncMeasurements(); });");
scoped('rendering/js/focused-home.js', sceneRestoreBefore, sceneRestoreAfter, 'components', sceneRestoreChecks);
for (const after of [
  sceneRestoreAfter.replace("event?.type === 'change'", "event?.type === 'popstate'"),
  sceneRestoreAfter.replace('if (revision !== sceneRevision) return;', ''),
  sceneRestoreAfter.replace('pane.syncState();', 'changeGlobalLayout();'),
  sceneRestoreAfter.replace('() => { pane.refresh(); syncMeasurements(); }', 'syncMeasurements'),
  sceneRestoreAfter.replace('pane.refresh(); syncMeasurements();', 'syncMeasurements(); pane.refresh();'),
  sceneRestoreAfter + "\nwindow.addEventListener('resize', syncMeasurements);",
  sceneRestoreAfter.replace("setScene(location.hash === '#map')", 'setScene(true)'),
  sceneRestoreAfter.replace("addEventListener('popstate'", "addEventListener('click'"),
  sceneRestoreAfter.replace("compact.addEventListener('change'", "compact.addEventListener('resize'"),
  sceneRestoreAfter + '\nimport "./new-global.js";',
  sceneRestoreAfter + '\nwindow.addEventListener("click", globalAction);',
]) scoped('rendering/js/focused-home.js', sceneRestoreBefore, after, 'full');
const sceneRestoreRuntimeBefore = execFileSync('git', ['show','74a41af18bd8bc0bef07e7365cbc84d738b966e6:js/focused-home.js'], {cwd:root,encoding:'utf8'});
const sceneRestoreRuntimeAfter = read('js/focused-home.js');
const knownSceneRestoreRuntime = createHash('sha256').update(sceneRestoreRuntimeAfter).digest('hex') === '7454340bc3b8b7806e14fc6c63b4fe9475438d2606d6807eb72c37544bd1ec88';
scoped('js/focused-home.js', sceneRestoreRuntimeBefore, sceneRestoreRuntimeAfter, knownSceneRestoreRuntime ? 'components' : 'full', knownSceneRestoreRuntime ? sceneRestoreChecks : []);
scoped('js/focused-home.js', sceneRestoreRuntimeBefore, sceneRestoreRuntimeAfter + '\nglobalThis.unrelated=1;', 'full');
for (const engine of ['chromium', 'webkit']) assert.deepEqual(
  new Set(browserMatrix('components', sceneRestoreChecks).include.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))),
  new Set(['map-routes', 'first-visit']), 'Responsive scene restoration retains exactly route and first-visit coverage');

// The same guard can move to wide maps, with no other CSS or selector change.
const sceneGuardRule = '.map-surface.is-map-switching :is(.map-node, .map-node-label, .map-camera) { transition: none; }';
const sceneGuardCssBefore = `.spatial-intro, .spatial-search, .spatial-field { display: none; }
@container map-viewport (max-width: 900px) {
.focused-home .map-node { transition: opacity 180ms var(--motion-enter); }
${sceneGuardRule}
.focused-home .map-node__glyph { scale: var(--spatial-scale, 1); }
}`;
const sceneGuardCssAfter = sceneGuardCssBefore.replace(`\n${sceneGuardRule}`, '').replace('\n@container', `\n${sceneGuardRule}\n@container`);
scoped('styles.css', sceneGuardCssBefore, sceneGuardCssAfter, 'components', sceneRestoreChecks);
for (const after of [
  sceneGuardCssAfter.replace('.map-camera)', '.map-camera, .site-header)'),
  sceneGuardCssAfter.replace('transition: none', 'transition: opacity 500ms'),
  sceneGuardCssAfter.replace('max-width: 900px', 'max-width: 901px'),
  sceneGuardCssAfter + `\n${sceneGuardRule}`,
  sceneGuardCssAfter + '\n.map-grid {opacity:0}',
]) scoped('styles.css', sceneGuardCssBefore, after, 'full');

// Project-caption placement owns no physics, picker or dependency changes.
const captionBefore = 'function paint(){const labelRoot=label.offsetParent;if(labelRoot){label.style.top="0px";}drawSphere();}';
const captionAfter = "const captionObstacle={entry:doc.querySelector('.overview-entry'),key:'',rect:null,pane:null,label:null};function paint(){const labelRoot=label.offsetParent;if(labelRoot){label.style.top='12px';}drawSphere();}";
scoped('rendering/practice-orbits.js', captionBefore, captionAfter, 'components', ['map-presentation']);
for (const after of [
  captionAfter.replace('drawSphere()', 'changePhysics()'),
  captionAfter.replace("querySelector('.overview-entry')", "querySelector('body')"),
  captionAfter.replace("label.style.top='12px'", "import('./new-dependency.js')"),
  captionAfter + '\nwindow.addEventListener("click", globalAction);',
  captionAfter + '\nimport "./new-global.js";',
]) scoped('rendering/practice-orbits.js', captionBefore, after, 'full');
const captionRuntimeBefore = execFileSync('git', ['show','ace9fe154c18372b79f1c6055c60956e70a474d9:js/practice-orbits.js'], {cwd:root,encoding:'utf8'});
const captionRuntimeAfter = read('js/practice-orbits.js');
const knownCaptionRuntime = createHash('sha256').update(captionRuntimeAfter).digest('hex') === 'eadacc6d1651ba4a76c55635e9e565a39a261c03dc7b87f90efe53cbbfef9ec0';
scoped('js/practice-orbits.js', captionRuntimeBefore, captionRuntimeAfter, knownCaptionRuntime ? 'components' : 'full', knownCaptionRuntime ? ['map-presentation'] : []);
scoped('js/practice-orbits.js', captionRuntimeBefore, captionRuntimeAfter + '\nglobalThis.unrelated=1;', 'full');

const spatialBefore = 'import {pane} from "./pane-viewport.js";import {mapButtons} from "./map-engine.js";import {reducedMotion} from "./preferences.js";const radius=1;';
const spatialAfter = spatialBefore.replace('{mapButtons}', '{mapButtons,getMapCoreRadius}').replace('radius=1', 'radius=2');
scoped('rendering/js/spatial-home.js', spatialBefore, spatialAfter, 'components', ['map-presentation']);
scoped('rendering/js/spatial-home.js', spatialBefore, spatialAfter.replace('getMapCoreRadius}', 'getMapCoreRadius,setMapFilter}'), 'full');

// An opened label's side tie-break keeps the complete hover/focus contract only.
const hoverLabelChanged = mapEngine.replace('core.radius+4', 'core.radius+5');
assert.notEqual(hoverLabelChanged, mapEngine);
scoped('js/map-engine.js', mapEngine, hoverLabelChanged, 'components', ['check:hover-layout']);
for (const after of [
  hoverLabelChanged.replace('centerY:rect.top+rect.height/2-bounds.top,radius:getMapCoreRadius(glyph)', 'centerY:rect.top+rect.height/2-bounds.top,radius:getMapCoreRadius(glyph)*.9'),
  hoverLabelChanged.replace('const duration = shouldMorph ? 440 : 320', 'const duration = shouldMorph ? 600 : 400'),
  hoverLabelChanged.replace('const glyphDiameter = Math.max(10, item.size * glyphScale)', 'const glyphDiameter = Math.max(20, item.size * glyphScale)'),
  hoverLabelChanged.replace('const placeMapLabel=(item,label)=>', 'const placeMapLabel=(label,item)=>'),
  hoverLabelChanged.replace('core.radius+5', 'import("./new-global.js")'),
  hoverLabelChanged + '\nimport "./new-global.js";',
  hoverLabelChanged + '\nwindow.addEventListener("resize", globalAction);',
]) {
  assert.notEqual(after, hoverLabelChanged, 'Negative hover fixture changes a protected operation');
  scoped('js/map-engine.js', mapEngine, after, 'full');
}
scoped('js/map-engine.js', mapEngine, hoverLabelChanged.replace('const sides=item.x>=72', 'const sides=item.x>=70'), 'components', ['map-labels']);
for (const engine of ['chromium', 'webkit']) assert.deepEqual(
  new Set(browserMatrix('components', ['check:hover-layout']).include.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))),
  new Set(['hover-layout']), 'Opened label placement retains the existing complete hover/focus coverage');

const movedCaption = mapEngine.replace('glyphDiameter * .65 + 12', 'glyphDiameter * .7 + 14')
  .replace('item.id === "garage" ? y + offset', 'item.id === "garage" ? y + offset + 2');
assert.notEqual(movedCaption, mapEngine);
scoped('js/map-engine.js', mapEngine, movedCaption, 'components', ['map-labels']);
for (const after of [
  movedCaption.replace('const duration = shouldMorph ? 440 : 320', 'const duration = shouldMorph ? 600 : 400'),
  movedCaption.replace('const glyphDiameter = Math.max(10, item.size * glyphScale)', 'const glyphDiameter = Math.max(20, item.size * glyphScale)'),
  movedCaption.replace('glyphDiameter * .7 + 14', 'moveNodes()'),
  movedCaption + '\nwindow.addEventListener("resize", () => {});',
  movedCaption + '\nconst broken = ;',
]) scoped('js/map-engine.js', mapEngine, after, 'full');
const dismissalChecks = ['check:hover-layout', 'check:case-flow', 'check:case-view', 'check:point-address'];
const adjustedDismissal = mapEngine.replace('event.clientY - mapDismissPointer.y) > 8', 'event.clientY - mapDismissPointer.y) > 10');
assert.notEqual(adjustedDismissal, mapEngine);
scoped('js/map-engine.js', mapEngine, adjustedDismissal, 'components', dismissalChecks);
for (const after of [
  adjustedDismissal.replace('const duration = shouldMorph ? 440 : 320', 'const duration = shouldMorph ? 600 : 400'),
  adjustedDismissal.replace('const glyphDiameter = Math.max(10, item.size * glyphScale)', 'const glyphDiameter = Math.max(20, item.size * glyphScale)'),
  adjustedDismissal.replace('selectedMapId=id;', 'selectedMapId=null;'),
  adjustedDismissal.replace('document.addEventListener("click", dismissMapPointerClick);', 'document.addEventListener("pointerup", dismissMapPointerClick);'),
  adjustedDismissal.replace('let restoringMapFocus = false;', 'let restoringMapFocus = startGlobalObserver();'),
  adjustedDismissal + '\nwindow.addEventListener("resize", () => {});',
]) {
  assert.notEqual(after, adjustedDismissal, 'Negative dismissal fixture changes an unowned operation');
  scoped('js/map-engine.js', mapEngine, after, 'full');
}
for (const engine of ['chromium', 'webkit']) assert.deepEqual(
  new Set(browserMatrix('components', dismissalChecks).include.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))),
  new Set(['hover-layout', 'case-flow', 'case-view', 'point-address']), 'Dismissal retains preview, card lifecycle and URL coverage');
for (const selector of ['.map-node-label', 'html[data-map-controls-ready] .map-anchor-label[data-map-label-id="garage"]', '.focused-home .map-space-label--south']) {
  scoped('styles.css', '', `@container map-viewport (min-width:901px){${selector} {transform:translate(-50%, 30px)}}`, 'components', ['map-labels']);
}
for (const selector of ['.map-anchor-label + .map-node', ':is(.map-anchor-label,.map-grid)', '.map-anchor-label,.map-grid']) {
  scoped('styles.css', '', `${selector} {opacity:0}`, 'full');
}
for (const engine of ['chromium', 'webkit']) assert.deepEqual(
  new Set(browserMatrix('components', ['map-labels']).include.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))),
  new Set(['map-routes', 'hover-layout', 'accessibility']), 'Caption placement retains existing complete contracts in both engines');
for (const owner of ['overview', 'not-found', 'map-presentation']) {
  const matrix = browserMatrix('components', [owner]).include;
  for (const engine of ['chromium', 'webkit']) assert.deepEqual(new Set(matrix.filter(job => job.browser === engine).flatMap(job => job.checks.split(','))), new Set(componentCoverage[owner]));
  assert(matrix.length < fullMatrix.length);
}

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
  writeFileSync(join(directory, "styles.css"), '.map-grid {color: black}');
  writeFileSync(join(directory, "js/whoop-day.js"), 'const interval = 1000;');
  writeFileSync(join(directory, "js/focused-home.js"), headerModule);
  writeFileSync(join(directory, "js/viewport-ui.js"), viewport);
  mkdirSync(join(directory, "assets/reels"), { recursive: true });
  writeFileSync(join(directory, "assets/reels/garage-site.mp4"), "original master");
  mkdirSync(join(directory, "assets/share"), { recursive: true });
  writeFileSync(join(directory, "assets/share/eleven.jpg"), "published share artwork");
  writeFileSync(join(directory, "README.md"), "Published");
  git("add", "."); git("commit", "-m", "published");
  const published = git("rev-parse", "HEAD");
  const plan = (options = {}) => planRelease({ projectRoot: directory, base: published, ...options });
  requireReleaseBase(plan({ target: 'HEAD' }));
  writeFileSync(join(directory, "assets/share/eleven.jpg"), "updated share artwork");
  assert.equal(plan().mode, "copy", "Existing share artwork uses publication asset checks");
  writeFileSync(join(directory, "assets/share/unknown.jpg"), "unregistered image");
  assert.equal(plan().mode, "full", "Unregistered or added artwork is not copy");
  rmSync(join(directory, "assets/share/unknown.jpg"));
  git('reset', '--hard', published);
  checks += 2;
  mkdirSync(join(directory, 'assets/point-thumbnails'), { recursive: true });
  const pointArtwork = join(directory, 'assets/point-thumbnails/running-light.webp');
  writeFileSync(pointArtwork, 'reviewed point artwork');
  assert.deepEqual(plan().components, [...relatedCoverage].sort(), 'Only registered point artwork selects its related-list owners');
  writeFileSync(join(directory, 'assets/point-thumbnails/unrelated-light.webp'), 'unknown artwork');
  assert.equal(plan().mode, 'full', 'An adjacent unregistered image cannot inherit the artwork boundary');
  rmSync(join(directory, 'assets/point-thumbnails/unrelated-light.webp'));
  git('add', 'assets/point-thumbnails/running-light.webp');
  assert.deepEqual(plan().components, [...relatedCoverage].sort(), 'Staged point artwork retains its owners');
  git('commit', '-m', 'point artwork fixture');
  const pointArtworkBase = git('rev-parse', 'HEAD');
  assert.deepEqual(plan({ target: 'HEAD' }).components, [...relatedCoverage].sort(), 'A committed artwork addition retains its owners');
  rmSync(pointArtwork);
  assert.equal(planRelease({ projectRoot: directory, base: pointArtworkBase }).mode, 'full', 'Deleting a registered image is not an artwork replacement');
  git('reset', '--hard', published);
  checks += 5;
  mkdirSync(join(directory, 'rendering'), { recursive: true });
  mkdirSync(join(directory, 'docs'), { recursive: true });
  for (const path of ['rendering/README.md', 'docs/point-thumbnails.md']) writeFileSync(join(directory, path), 'Reviewed documentation');
  assert.equal(plan().mode, 'copy', 'Only the two named new documents are copy');
  git('add', 'rendering/README.md', 'docs/point-thumbnails.md');
  assert.equal(plan().mode, 'copy', 'Staged named documentation is copy');
  git('commit', '-m', 'documentation fixture');
  const documentationBase = git('rev-parse', 'HEAD');
  assert.equal(plan({ target: 'HEAD' }).mode, 'copy', 'Committed named documentation is copy');
  writeFileSync(join(directory, 'rendering/README.md'), 'Updated build notes');
  assert.equal(planRelease({ projectRoot: directory, base: documentationBase }).mode, 'copy', 'Named build-note changes are copy');
  rmSync(join(directory, 'docs/point-thumbnails.md'));
  assert.equal(planRelease({ projectRoot: directory, base: documentationBase }).mode, 'full', 'Documentation deletion is not an approved addition or edit');
  git('reset', '--hard', published);
  checks += 5;
  writeFileSync(join(directory, 'js/map-engine.js'), mapEngine);
  git('add', '.'); git('commit', '-m', 'caption fixture');
  const labelBase = git('rev-parse', 'HEAD');
  writeFileSync(join(directory, 'js/map-engine.js'), movedCaption);
  assert.deepEqual(planRelease({ projectRoot: directory, base: labelBase }).components, ['map-labels']);
  git('reset', '--hard', published);
  writeFileSync(join(directory, 'js/viewport-ui.js'), consoleFix);
  assert.deepEqual(plan().components, ['console-bounds']);
  assert.equal(plan().matrix.include.length, 6);
  writeFileSync(join(directory, 'js/viewport-ui.js'), viewport);

  writeFileSync(join(directory, 'js/focused-home.js'), sharedHeader);
  writeFileSync(join(directory, 'styles.css'), '.map-grid {color: black}\n.site-header {padding: 12px}');
  assert.deepEqual(plan().components, ['header']);
  assert.equal(plan().staticScope, 'copy', 'Header changes retain the base static checks without FFmpeg.');
  git('add', '.'); git('commit', '-m', 'local header');
  assert.deepEqual(plan({target: 'HEAD'}).matrix, browserMatrix('components', ['header']));
  writeFileSync(join(directory, 'styles.css'), '.map-grid {color: black}\n.site-header {padding: 12px}\n.command-dock__mark svg {fill: none}');
  assert.deepEqual(plan().components, ['header', 'search-icon']);
  writeFileSync(join(directory, 'styles.css'), '.map-grid {color: red}\n.site-header {padding: 12px}');
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
  writeFileSync(join(directory, "styles.css"), '.map-grid {color: black}\n.settings-panel__note {margin: 8px}');
  writeFileSync(join(directory, "index.html"), shell.replace('<p>Details</p>', '<section>Details</section>'));
  assert.equal(plan().mode, "components");
  git("add", "."); git("commit", "-m", "settings layout");
  writeFileSync(join(directory, "js/whoop-day.js"), 'const interval = 2000;');
  git("add", "."); git("commit", "-m", "whoop refresh");
  assert.deepEqual(plan({ target: "HEAD" }).components, ["settings", "whoop"], "Component coverage combines unpublished commits");
  assert.deepEqual(plan({ target: "HEAD" }).matrix, browserMatrix("components", ["settings", "whoop"]));
  writeFileSync(join(directory, "js/observation-route.js"), route.replace("20000", "10000"));
  assert.ok(plan().components.includes("overview"), "Unpublished route timing requires overview coverage");
  writeFileSync(join(directory, "js/panels.js"), panels + '\nwindow.addEventListener("resize", () => {});\n');
  git("add", "."); git("commit", "-m", "unpublished shared navigation");
  writeFileSync(join(directory, "README.md"), "Another copy edit");
  git("add", "."); git("commit", "-m", "another copy edit");
  assert.equal(plan({ base: "HEAD^", target: "HEAD" }).mode, "copy");
  assert.equal(plan({ target: "HEAD" }).mode, "full", "Entire unpublished range determines the gate");
  assert.throws(() => requireReleaseBase(plan({ target: 'HEAD' })), /HEAD contains unpublished changes/,
    'A small fix cannot silently publish a committed feature backlog');
  requireReleaseBase(plan({ target: 'HEAD' }), true);
  assert.equal(plan({ target: 'HEAD' }).mode, 'full', 'Explicit bundling does not narrow or bypass checks');
  assert.throws(() => requireReleaseBase(plan({ base: 'missing-ref', target: 'HEAD' }), true), /Cannot verify/);
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
assert.match(workflow, /concurrency:\n  group: quality-\$\{\{ github.ref \}\}\n  cancel-in-progress: true/,
  'Only a newer candidate on the same ref cancels obsolete work; PRs stay independent');
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
  put('styles.css', '.map-grid {color: black}');
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
  assert.equal(plan().staticScope, 'checks', 'Mixed signature and tooling preserves both static contract sets');
  assert.deepEqual(plan().matrix, browserMatrix('components', ['signature']), 'Tooling adds no unrelated browser jobs');
  put('styles.css', '.map-grid {color: red}');
  assert.equal(plan().mode, 'full', 'A signature cannot hide a shared portfolio style change');
  assert.equal(plan().staticScope, 'static');
  assert.deepEqual(plan().matrix, browserMatrix('full'));
} finally { rmSync(isolatedDirectory, { recursive: true, force: true }); }
console.log(`PASS: ${checks} copy/component/global changes; unsafe syntax, combined git history, complete browser coverage and all Quality lanes.`);

// Local consent presentation keeps the actual consent, first-visit and reflow
// checks; a shared selector or executable UI change still requires full scope.
for (const selector of ['.analytics-notice', '.analytics-notice__actions button', '.analytics-notice__note']) {
  scoped('styles.css', '', `${selector} {margin:0}`, 'components', ['consent']);
}
for (const selector of ['.analytics-notice + .map-node', '.analytics-notice,.map-grid', ':is(.analytics-notice,.map-grid)']) {
  scoped('styles.css', '', `${selector} {opacity:0}`, 'full');
}
for (const engine of ['chromium', 'webkit']) assert.deepEqual(
  new Set(browserMatrix('components', ['consent']).include.filter(row => row.browser === engine).flatMap(row => row.checks.split(','))),
  new Set(['core', 'accessibility', 'first-visit']));
for (const path of ['scripts/release.mjs', 'scripts/release-version.mjs', 'scripts/component-scope.mjs', 'scripts/check-runner.mjs']) {
  assert.equal(classifyChange(path, 'before', 'after').mode, 'copy');
}
