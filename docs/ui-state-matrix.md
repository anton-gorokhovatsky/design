# Матрица состояний интерфейса

Это актуальный статический workbench для vanilla HTML/CSS/JS-сайта. Он
определяет обязательные состояния и доказательства для текущего кода.
Датированные результаты, отозванные PASS и production-свидетельства вынесены
в [`acceptance-history.md`](./acceptance-history.md).

## Принцип проверки

1. Запустить `node scripts/audit-project.mjs`.
2. Выбрать затронутые состояния из каталога ниже.
3. Снять before/after в одинаковых viewport, theme и UI-state.
4. Проверить computed styles и browser contract, а не позицию декларации в CSS.
5. Для каждого затронутого семейства снять крупный кроп 1:1.
6. Перед релизом выполнить всю матрицу в Chromium и WebKit.

Дефект после PASS отзывает приёмку всего связанного семейства. Автоматический
кадр не заменяет контроль на физическом Safari там, где важны экранная
клавиатура, safe area или системный жест.

Имена артефактов: `<viewport>-<theme>-<state>.png`.

## Базовые viewport

| ID | Размер | Назначение |
|---|---:|---|
| `desktop` | `1440×900` | Полная композиция, drag-модули и project reel |
| `tablet` | `1024×768` | Промежуточная компоновка |
| `mobile` | `390×844` | Основной touch-сценарий |
| `compact` | `320×568` | Минимальная ширина и короткий экран |
| `keyboard` | `390×430`, screen `390×844` | Поиск над экранной клавиатурой |
| `reflow` | `720×450`, device scale `2` | Эквивалент 200% zoom |

Базовые viewport проверяются в light и dark. Для релевантных состояний
добавляются keyboard focus, reduced motion, higher contrast и forced colors.

## Каталог состояний

| State | Как получить | Что проверять |
|---|---|---|
| `map-idle` | Чистая загрузка без выбора | Имя и роль читаются как тихое авторство на desktop; consent скрыт; карта и оси не конфликтуют; `МАРШРУТ / 60 СЕК` повторяет границы `.map-axis-label`, не объектных подписей |
| `garage-selected` | `?point=garage` | Один selected state, inspector в viewport, ссылка/close и возврат focus |
| `running-selected` | Активировать `БЕГ` | Dusk-токен, южное положение, доступный readout и отсутствие перекрытия |
| `project-selected` | Выбрать независимый проект | Контракт выдерживает разные title/meta/description |
| `project-reel` | Hover/focus проекта на desktop | Receiver `3:2`, `contain`, отдельный material-readout, без chrome и crop |
| `filter-*` | Переключить пять фильтров | Типы не смещаются, выбранная точка и реальные связи сохраняются |
| `chronology` | Включить хронологию | Датированные точки следуют годовым орбитам; недатированные не имитируют дату |
| `search-default` | Фокус пустого поиска | Семь результатов, listbox/active option и fit над строкой |
| `search-match` | Ввести `гараж` | Keyboard route и совпадения без ложных результатов |
| `search-empty` | Ввести строку без совпадений | Понятное empty-state сообщение без декоративной заглушки |
| `search-keyboard` | `390×430`, `ArrowUp`, `Escape` | Список сразу встаёт над строкой без въездного смещения; скроллится список, не страница; dock/nav скрываются и возвращаются |
| `panel-work` | Открыть `ПРОЕКТЫ` | Intro и восемь карточек; роль видна; mobile stack не обрезает текст |
| `panel-approach` | Открыть `ПОДХОД` | Четыре операции, читаемый sticky-stack и обычная прокрутка |
| `panel-contact` | Открыть `СВЯЗАТЬСЯ` | Два контакта и один маршрут резюме в Notion; без открытых адресов и overflow |
| `mobile-nav-open` | Открыть mobile navigation | Пять равных строк, hit-area `40px`, aria-current и Escape/focus return |
| `mobile-authorship-compact` | Любая ширина `≤680px`, карта без выбранной точки | Тихая desktop-подпись авторства скрыта; карта сохраняет исходное кадрирование |
| `analytics-consent` | Открыть через `ЭКРАН`, поиск или `?analytics-consent=show` | До opt-in нет Метрики; allow/deny сохраняются; consent не появляется сам на первом визите |
| `analytics-decision-signals` | После opt-in открыть точку, выбрать результат поиска, открыть панель и завершить маршрут | Есть `point_open`, `search_success`, `panel_open`, `observation_complete`; только allowlisted параметры, без поискового текста и свободных значений |
| `resume-notion` | Открыть маршрут `РЕЗЮМЕ / NOTION` | Внешняя ссылка имеет понятное доступное имя и ведёт на актуальную хронологию |
| `share-route` | Открыть шесть `/work/<id>/` | Собственные title/description/canonical/OG `1200×630`, затем корректный `?point=<id>#map` |
| `no-script` | Отключить JavaScript | Автор, назначение, шесть работ, Notion-резюме и контакты доступны без tracking pixel |
| `keyboard-focus` | Tab/Shift+Tab/Enter/Space/Arrows/Escape | Видимый focus, порядок, focus trap/return |
| `text-zoom` | 200% zoom и ширина 320 CSS px | Текст не обрезан, обычный контент не требует горизонтального скролла |
| `reduced-motion` | `prefers-reduced-motion: reduce` | Нет морфинга/перемещения; функции и конечные состояния сохранены |
| `forced-colors` | Forced colors/high contrast | Точки, controls, focus и selected различимы без tint/blur |
| `favicon-hidden` | Скрыть вкладку и вернуть её | Canvas favicon останавливается в фоне и возобновляется только после `visibilitychange`; reduced motion статичен |

## Обязательные модульные кропы

| Семейство | Кропы | Что сравнивать |
|---|---|---|
| `first-visit` | Авторство, origin CTA, mobile top area | Иерархия, отсутствие overlap, роль не становится logo-object |
| `console-view` | Панель и active-row | Колонка маркеров, baseline, focus и активная риска |
| `console-display` | Панель и analytics action | Общий ритм, material, focus, состояние privacy |
| `console-command` | Nav + поиск | Оси знаков, input, submit и keyboard results |
| `map-annotations` | Оси, origin, Garage, running | Линии под material-подписями, отступы и оптические центры |
| `content-work` | Intro, короткая и длинная карточки | Number/title/role/domain, переносы и material |
| `content-approach` | Intro + четыре карточки | Meta/title/body, sticky layers и целые формы |
| `content-contact` | Полная карточка | Два действия, resume links и reflow |
| `project-reel` | Receiver + readout | Нативная геометрия, poster/video и progress |

## Accessibility tree

- обе skip-ссылки;
- группа точек карты и уникальные имена кнопок;
- `aria-pressed`, `aria-expanded`, `aria-controls`, `aria-current`;
- `inert`/`aria-hidden` закрытых inspector и dialog;
- focus trap/return;
- декоративные specks, canvas и ASCII скрыты;
- вся существенная информация доступна без hover/video;
- Notion-резюме имеет различимое доступное имя во всех трёх публичных маршрутах.

## Условия готовности

- Нет новых material, type, corner или motion variants.
- Нет clipping, overlap, горизонтального overflow и split внутри чисел.
- Мышь, клавиатура и touch ведут к тем же данным.
- Theme, 200% text/zoom, reduced motion и contrast не закрывают информацию.
- CSS-очистка подтверждена matched before/after.
- `node scripts/check-project.mjs` и `git diff --check` проходят.
- Для изменённого видео также проходит `node scripts/check-reels.mjs`.
- Релиз выполнен только после явного одобрения, Pages deployment и публичного
  asset/render-контроля.

## Текущий локальный проход

Кандидат заменяет два редакционных шоурила и их воспроизводимый capture.
Webzine показывает светлую обложку и оглавление, открывает реальный текст Донны
Харауэй и переключает его в тёмную тему. Shirokostup держит светлую главную,
открывает полный Index, переключает эту же поверхность в тёмную тему и спокойно
переходит в Selected work. Две пары вторичных глав разделяют светлые и тёмные
сцены. Точечные Chromium-контракты и полный локальный Chromium/WebKit gate уже
прошли; production-PASS будет зафиксирован только после публикации и проверки
публичных media bytes.
Датированные доказательства записаны в
[`acceptance-history.md`](./acceptance-history.md).
