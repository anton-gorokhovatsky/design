# Shared map scene primitives

The story renders from the actual `mapItems`, audience mass weights and Newtonian orbit solver. Its painters, orbit categories, time positions and screen projection live in `js/map-scene-primitives.js`, loaded only with the story. The main map retains its already published renderer and the shared solver/data. These notes describe the illustrative painter; the geodesic close-up is documented separately in `story-gravity.md`.

- Illustrative light transport: art-directed disk warp, 3D pulsar projection.
- One restrained scattering profile for the two self-luminous objects.
- Their different emission colours remain semantic, with warm neutral highlights.
- Cache geometry and shadow. Only the material moves from frame to frame.
- Distorted far-side disk images, above and below the opaque shadow.
- The near side is in front of the shadow.
- On a pale field, low energy must fade out instead of becoming grey.
- Temperature belongs to the sampled material, independently of opacity.
- A luminous source, not a lit planetary surface. Each sprite is a soft
- cross-section of a narrow illustrative radiation beam, projected in 3D.
- Two poles stand for two alternating steps. 180 steps/min = 90 turns/min;
- Slow the cadence by 12 for a readable eight-second visual rotation.
- A fixed spin axis, and an oblique magnetic axis. The observer-dependent
- light varies with the same geometry; there is no unrelated blink timer.
- Surface emission follows the magnetic poles rather than a fixed lamp.
- This is a simple thermal-cap illustration, without a GR surface model.
- Bright axial beam with a faint scattered envelope. Exponential
- falloff makes it disappear before the canvas edge, without a tip.
- Soft surrounding emission establishes volume without a hard halo edge.
- A softened point-lens displacement with compact C2 support. R = 7 core radii;
- p' = c + (p-c) [1 + E²/(r²+s²) (1-r²/R²)^3], for r<R.
- E=1.35a, s=.9a. Finite at the centre; displacement and two derivatives
- vanish at R. This is an illustrative screen mapping, not a GR simulation.
