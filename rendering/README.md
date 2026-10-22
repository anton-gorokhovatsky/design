# Исходник небесных тел

`celestial-bodies.js` — редактируемый исходник. Браузер загружает только
`../js/celestial-bodies.js`: компактную сборку этого же модуля. Относительные
импорты исходника рассчитаны на расположение сборки в `js/`.

Из корня репозитория, Node 22.13 или новее:

```sh
npm exec --yes --package=terser@5.44.0 -- terser rendering/celestial-bodies.js --module --compress --mangle --output js/celestial-bodies.js
node scripts/cache-versions.mjs --write
node scripts/check-performance-budget.mjs
```

Сборка не меняет GLSL-уравнения. Сжатие применяется только к этому модулю,
чтобы новый рендер оставался в существующих бюджетах; пределы не повышались.
Физическая модель и её границы: [чёрная дыра](../docs/black-hole-rendering.md).

После изменения исходника пересобрать модуль и проверить затронутый рендер.
