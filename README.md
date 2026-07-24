# Anton — practice map

Static personal portfolio for a digital product manager, web project lead, and
design engineer. The site is organized around a semantic four-direction map
instead of a conventional résumé timeline.

## Map model

- North: companies and institutions.
- East: projects and launches.
- South: personal interests.
- West: roles and ways of working.
- Position communicates semantic proximity, not a quantitative score.
- Point size communicates the personal weight of an experience.
- Shape distinguishes company, project, personal, and practice nodes.
- Garage Museum is the map's largest node and a connected project graph: the
  Museum site, Narkomfin, Collection and Open Storage, archives, online courses,
  the inclusive museum app, the research webzine, the endowment, and support for
  cultural institutions.

An unframed point constellation is the visual origin of the coordinate system.
It samples the nine emoji signatures from the earlier portfolio
(`🍣 🥪 ☕ 📻 🏂 ⚽ 🌊 🖥️ 👋`), redraws them with small mono glyphs, morphs from
one silhouette to the next, and slowly rotates as one orbital system.
`AG / ORIGIN` remains a small coordinate label inside the field, not a separate
logo card.

## Interaction model

- The map is the full-screen default state; the portfolio does not continue as
  a conventional scrolling page.
- Node selection opens a compact inspector over the map.
- A compact `VIEW` selector in the system rail isolates the four
  semantic fields without moving nodes.
- The query bar sits above the system rail and uses the functional prompt
  `НАЙТИ ИЛИ ОТКРЫТЬ…` to search nodes or open content panels.
- Primary navigation is part of the map rather than a separate header: an
  indexed row of satellite points on desktop becomes a small expandable orbit
  on narrow screens.
- Hovering or focusing an institutional node or one of the eight selected
  project nodes temporarily turns the central origin into a media receiver.
  Museum Garage uses a muted nine-second excerpt from the Charmer showreel.
  Each selected project uses a muted eight-second site reel assembled from four
  characteristic live states; institutions without media keep the generated
  ASCII fallback.
- Touch devices keep the direct node-to-inspector interaction and do not render
  hover-only media.
- Long-form content remains inside the same coordinate system. Projects,
  approach, and contact appear as groups of soft, dismissible floating
  materials; they never replace the map with a full-height drawer.

## Instrument interface language

- Retrofuturism is used as interaction logic, not as visual pastiche: the map
  scans a field, controls change observation modes, and conventional lists
  remain available as a secondary route.
- Observation settings (`VIEW`, `DISPLAY`) stay at the edges of the field.
  Content navigation uses indexed points rather than button bars.
- IBM Plex Mono carries the instrument layer. Human content switches to a
  neutral Arial/Helvetica sans-serif voice: large, grey, compact, and direct.
- Content surfaces use roughly half-transparent white (or its dark-theme
  counterpart) with a 24px backdrop blur and no heavy shadow or enclosing
  screen. Subtle blush and lilac light belong to the field behind the material,
  so the tint is produced through translucency rather than opaque card colour.
- Typography follows Max Kohler's
  [continuous typography](https://www.maxkohler.com/posts/continuous-typography/)
  principle: type size, measure, spacing, and line-height are relationships to
  the available viewport and reader defaults, expressed with `clamp()`,
  viewport/rem inputs, and unitless leading. Breakpoints may regroup the
  composition, but must not introduce unrelated typographic scales.
- Museum Garage is the largest black node and is named directly. Its importance
  is communicated by scale and connections rather than a slogan.

## Selected work

- [Olga Shirokostup](https://shirokostup.site/)
- [Tarski](https://tarski.ru/)
- [Herman & Co](https://barberherman.ru/)
- [Dusty Dumbbells Merch](https://merch.dustydumbbells.com/)
- [Dusty Dumbbells Camp](https://camp.dustydumbbells.com/)
- [11 111](https://11111.life/)
- [KS Fish](https://ks.fish/)
- [Doronin](https://doronin.store/)

The site uses static HTML, CSS, and JavaScript and publishes from the
repository's `gh-pages` branch.

IBM Plex font files are self-hosted under the SIL Open Font License 1.1; the
license is included at `assets/fonts/LICENSE.txt`.
