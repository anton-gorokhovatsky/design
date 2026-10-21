# Map layout implementation notes

Rationale for the existing clearance and authored layout in `js/map-engine.js`.
Kept outside the startup bundle so the hover rendering fix fits the unchanged
performance limits. This move changes no layout logic.

- Keep map points clear of controls.
- Use three quarters of the available outer field, with a bounded stretch. The existing clearance pass then fits this target around actual controls.
- Shared origin and angular anchors scale with the usable mobile map field. The radii reserve room for each system's sphere, orbit and attached label.
- Labels stay inside the available field, including the permitted tilt.
- Borrow the spare lower field for the upper group, gradually reducing the shift toward the personal nodes so the whole composition still fits.
- Mobile titles reserve space alongside the consoles. First place the author's named landmarks, then fit other nodes around them.
- Orbit projects are positioned by their own layer. Reserving their old map positions leaves phantom obstacles and exhausts the compact field.
- Reserve the whole pointer target, including on compact maps.
- Find the nearest free ring when the edges are occupied.
- Keep the institutional anchor; open the lower sectors toward the dock.
- The center, personal sector and principles retain their authored anchors.
- Authored emphasis, independent of case order and node size. Herman is considered last, after the main labels have claimed their space.
