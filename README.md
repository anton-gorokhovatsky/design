# Anton — personal index

Mobile-first personal site built as a single tactile index of universal
symbols and selected live work. Project surfaces can be moved with a mouse and
opened through direct external links.

## Selected work

- [Tarski](https://tarski.ru/)
- [Herman & Co](https://barberherman.ru/)
- [Dusty Dumbbells Merch](https://merch.dustydumbbells.com/)
- [DD Camp](https://camp.dustydumbbells.com/)
- [11 111](https://11111.life/)
- [KS Fish](https://ks.fish/)
- [Doronin](https://doronin.store/)

The site is static HTML, CSS, and JavaScript and can be published directly with
GitHub Pages.

## Shape rules

Large matte surfaces should use continuous corners, not arbitrary circular
rounding. Keep `border-radius` as the fallback geometry, then add
`corner-shape: superellipse(...)` through the shared tokens in `styles.css`.
Use smoother shapes for the project clouds and dynamic readout; keep true icon
buttons circular.
