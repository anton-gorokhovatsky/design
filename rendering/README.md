# Исходники небесных тел и орбит

`celestial-bodies.js` — редактируемый исходник. Браузер загружает только
`../js/celestial-bodies.js`: компактную сборку этого же модуля. Относительные
импорты исходника рассчитаны на расположение сборки в `js/`.

Из корня репозитория, Node 22.13 или новее:

```sh
npm exec --yes --package=terser@5.44.0 -- terser rendering/celestial-bodies.js --module --compress --mangle --output js/celestial-bodies.js
node scripts/cache-versions.mjs --write
node scripts/check-performance-budget.mjs
```

Сборка не меняет GLSL-уравнения. Сжатие применяется к графическим модулям,
чтобы новый рендер оставался в существующих бюджетах; пределы не повышались.
Физическая модель и её границы: [чёрная дыра](../docs/black-hole-rendering.md).

После изменения исходника пересобрать модуль и проверить затронутый рендер.

`practice-orbits.js` хранит редактируемый исходник орбит и мобильного списка
проектов. После его изменения собрать `../js/practice-orbits.js` той же командой:

```sh
npm exec --yes --package=terser@5.44.0 -- terser rendering/practice-orbits.js --module --compress --mangle --output js/practice-orbits.js
```

У списка проектов прокрутка проходит под закреплённым заголовком. Заголовок
и нижняя подложка используют общий `MATERIAL / 01` как соседние плоскости;
оболочка в этом состоянии прозрачна, без второго слоя стекла. В обычном превью
материал снова принадлежит оболочке. Высота шапки измеряется после переноса
заголовка и при увеличении текста.

## Рассказ и две области

Читаемые исходники новых компактных модулей находятся в `rendering/js/`
и `rendering/assets/map-story/`. Их пути соответствуют файлам исполнения
от корня сайта. Terser 5.44.0 с `--module --compress --mangle` собирает каждый
в одноимённый путь без префикса `rendering/`. Для `signal-field.js` сохранить
имена `signalContext,fontSize,signalFont` через `--mangle reserved=[signalContext,fontSize,signalFont]`: статический контракт проверяет назначение общего шрифта canvas.

Для `viewport-ui.js` читаемый файл содержит весь актуальный модуль, но Terser
сжимает только блок от `const scrollLensControllers` до `const observeScrollEdges`.
При сборке блока сохранить имена `observeScrollLens`, `clearScrollLenses`,
`lensPanel` и их внешнее использование (временно экспортировать эти три имени
для Terser, затем убрать только добавленный export). Исполняемый код префикса
и суффикса переносить без изменений: они сохраняют именованные контракты
области консоли. Строковые комментарии оставлять в читаемом исходнике,
не включая их в поставляемый runtime.

`map-engine.js` хранит весь проверенный исходник в `rendering/js/map-engine.js`.
Чтобы сохранить именованные контракты подписей и жестов, компактная сборка
затрагивает только два блока: от `const mapTargetDiameter=` до
`const setMapDescription=` и от `const syncMapRelationships=` до
`let inspectorReturnHandler=`. Terser 5.44.0 меняет форматирование и локальные
имена без `--compress` и без переименования верхнего уровня; `id` и `evidence`
во втором блоке сохраняются для существующих статических контрактов.
Комментарии остаются в читаемом исходнике. Из корня репозитория:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'acorn';
const temporary = fs.mkdtempSync(join(tmpdir(), 'portfolio-map-build-'));
let code = fs.readFileSync('rendering/js/map-engine.js', 'utf8');
try {
  for (const [start, end, mangle] of [
    ['const mapTargetDiameter=', 'const setMapDescription=', ''],
    ['const syncMapRelationships=', 'let inspectorReturnHandler=', 'reserved=[id,evidence]'],
  ]) {
    const from = code.indexOf(start), to = code.indexOf(end, from);
    if (from < 0 || to <= from) throw new Error('Map build boundary missing');
    const input = join(temporary, 'block.js');
    fs.writeFileSync(input, code.slice(from, to));
    const args = ['exec', '--yes', '--package=terser@5.44.0', '--', 'terser', input, '--mangle'];
    if (mangle) args.push(mangle);
    const block = execFileSync('npm', args, { encoding: 'utf8' }).trimEnd();
    code = code.slice(0, from) + block + '\n' + code.slice(to);
  }
  const comments = [];
  parse(code, { ecmaVersion: 'latest', sourceType: 'module', onComment: comments });
  for (const comment of comments.reverse()) code = code.slice(0, comment.start) + code.slice(comment.end);
  fs.writeFileSync('js/map-engine.js', code);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
JS
```

Для отдельного владельца `renderMapRelatedItems` (до `const setInspectorOpen=`)
с 29 октября 2026 года применяется обычное сжатие Terser 5.44.0:
`module: true`, `compress: true`, `mangle: true`. Перед сборкой фрагмента
временно экспортировать `renderMapRelatedItems`, затем удалить только этот
добавленный export: имя владельца остаётся доступным остальному модулю.
Не использовать `unsafe` или переименование свойств. Заменять только этот
фрагмент в runtime; его префикс и суффикс сохранять побайтно. Имена `id`
и `evidence` защищены в прежнем большом блоке, но внутри этого изолированного
владельца не являются внешним контрактом. Читаемый исходник сохраняется.

`analytics.js` сохраняет читаемый исходник в `rendering/js/analytics.js`.
Его runtime сжимается только форматированием, без изменения выражений и имён:
`terser rendering/js/analytics.js --ecma 2022 --module --output js/analytics.js`
(Terser 5.44.0, без `--compress` и `--mangle`). После форматирования сохранить
пробелы в условии `analyticsPreference === "allowed"`: его точную запись
проверяет существующий статический контракт явного согласия.

`js/pane-viewport.js` измеряет область карты, уведомляет её о смене ширины
и синхронизирует классы состояния. В CSS размерные условия карты используют
контейнер `map-viewport`; настройки устройства и темы остаются media queries.
`js/map-story.js` загружает рассказ по первому открытию. Его отдельные файлы
перечислены в `storyFiles`: они имеют хеши, проверку публикации и собственный
предел дополнительных байтов. Прежние начальные бюджеты не повышены.

Перед выпуском: `node scripts/cache-versions.mjs --write`, затем обычный
release gate. `check-map-story.mjs` включён в обе браузерные матрицы: видимый
вход, возврат, клавиатура, общая пауза, подписи, retry и 320 px / 200% текста.
