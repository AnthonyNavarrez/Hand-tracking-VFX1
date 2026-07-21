# Pinky-Up Rotating Sphere — Feature Plan

A new gesture on top of the existing lens: when the **right hand's pinky is
raised**, the flat inverted quad crossfades into a **rotating 3D sphere**
centered between RI/RT/LI/LT, sized by how far apart the corners are, wrapped
in the live video, with all four existing effects (invert/pixelate/dither/
aberration/posterize) still working on its surface.

This is a bigger architectural step than the four gesture effects already
built (pixelate, dither, chromatic aberration, posterize), which were all
shader-level color/UV tricks layered on the *same* flat, unlit, screen-space
quad. This feature introduces real 3D geometry, a second (spherical)
texture-mapping technique, and basic lighting — none of which exist in the
codebase yet.

---

## How to use this document

Same workflow as `lens-invert-hand-tracking-plan.md`: build **sub-phase by
sub-phase**, stop at each **Acceptance** check, don't scaffold ahead.
`DECISION:` markers reflect choices already made by the project owner —
don't silently change them; ask first.

---

## Decisions baked in

- `DECISION:` **Trigger = right hand's pinky raised**, specifically — not
  left, not either hand. Requires both hands tracked (existing hide-until-
  both-hands behavior still applies; the sphere is a *mode* of the lens, not
  a replacement for the two-hands requirement).
- `DECISION:` **Live-wrap texture**, not a frozen/captured snapshot. Chosen
  specifically for lower bug risk: it reuses the exact same
  `THREE.VideoTexture` already plumbed through the app, with no new
  render-to-texture pass, no `WebGLRenderTarget` lifecycle to manage, no
  capture-timing races, no `flipY`/color-space mismatches between a captured
  texture and a live one. The tradeoff: the sphere shows the live feed
  wrapped around it going forward, not a "frozen" image of what the lens
  showed at the moment of the gesture.
- `DECISION:` **All four existing effects carry over** — pixelate, dither,
  chromatic aberration, and posterize all still apply on the sphere's
  surface, ported from screen-space/CSS-px math to the sphere's own UV
  space (see Core architecture).
- `DECISION:` **Crossfade transition** — the quad's opacity ramps 1→0 while
  the sphere's ramps 0→1 over the same window, both driven by one shared
  smoothed 0–1 value (same lerp-toward-target technique already used for
  `uOpacity`, `uEffectMix`, `uAberrationMix`, `uPosterizeMix`). Not a hard
  cut/pop.
- `DECISION:` **Rotation = slow constant spin around the vertical (Y) axis**
  — not tumbling, not tied to hand movement/velocity.
- `DECISION:` **Smooth `THREE.SphereGeometry`, not a faceted icosahedron.**
  Superseded during Phase S1 — the faceted look was tried and the project
  owner chose the smooth sphere instead. Clean equirectangular UVs, no
  polyhedron seam/stretching tradeoff to manage.
- `DECISION:` **Duplicate the effect-gesture logic into `LensSphere`**
  rather than refactoring it out of `LensQuad` into a shared hook (option
  (A) in §5 below) — the safer, more literal reading of "must not affect
  existing features," at the cost of some code duplication between the two
  components.
- `DECISION:` **Must not affect any existing feature.** Concretely: with the
  right pinky curled (not raised), the app must behave *exactly* as it does
  today. This is the primary constraint shaping the architecture choices
  below — new code is additive (new files, new props) wherever a choice
  exists between "modify existing code" and "add alongside it," even where
  the latter costs a little duplication.

---

## Core architecture

### 1. Right-pinky detection — new data, not just new math

The four existing gestures (pinch distance, thumb-above-index, hands-crossed)
are all computed from the 4 derived `Corners` already flowing into
`LensQuad`. Pinky detection needs landmarks the corners don't carry — pinky
tip (20) plus reference joints (e.g. MCP 17) to judge "extended" vs.
"curled," normalized by hand scale so it works at any distance from the
camera, not a simple Y-position check (unlike the thumb-above-index gesture,
"pinky up" can happen at many hand rotations, so Y-position alone would be
unreliable).

This means the **raw per-hand landmark data** needs to reach a place that
can compute this — currently `LensQuad` only ever receives the 4 reduced
`Corners`, never the full 21-point hand data. Plan: add a new function
(likely `tracking/gestures.ts`, a sibling to `tracking/corners.ts`) that
takes the `HandLandmarkerResult` and returns whether the right hand's pinky
is extended, using the same hysteresis-margin pattern as the existing
gestures for stability. `App.tsx` computes this alongside the existing
`corners` call and passes it down as a new prop — additive, doesn't change
how `corners` itself is computed.

### 2. Sphere mesh + live spherical wrap — new files, not modified files

New `scene/LensSphere.tsx` + `scene/sphereShader.ts`, parallel to
`LensQuad.tsx`/`lensShader.ts` but **not editing those files** for the core
sphere rendering — isolates blast radius per the "must not affect existing
features" constraint.

- `THREE.SphereGeometry` (smooth, per `DECISION:` above), using its clean
  equirectangular lat-long UV mapping — no seam/stretching mitigation
  needed.
- Vertex shader passes through the sphere's own UV (`vUv`) and a
  transformed normal — different from the quad's vertex shader, which only
  computes `gl_Position` and relies entirely on screen-space sampling.
- Fragment shader samples `uVideoTexture` at `vUv` (mirrored on X, same as
  everywhere else) instead of `gl_FragCoord`-derived screen UV — this is
  the fundamental technique switch from "sample by screen position" (the
  quad's whole trick) to "sample by surface position" (standard
  texture-mapped 3D object). This is *required* for rotation to be visible
  at all — a screen-space-sampled sphere would look identical spinning or
  not, since nothing would be anchored to its surface.
- A simple fixed-direction Lambertian light term (`dot(normal, lightDir)`)
  so the sphere reads as 3D — the quad has no lighting concept today, this
  is new.

### 3. Position, size, rotation

- Position = centroid of the 4 smoothed corners (already computed today for
  the chromatic-aberration center — same math, reused).
- Radius = a function of corner spread (e.g. average corner-to-centroid
  distance), smoothed with the same per-frame lerp used for everything else
  so growing/shrinking is fluid, not jumpy.
- Rotation: `sphere.rotation.y += constant * delta` per frame. Low risk,
  standard technique.

### 4. Crossfade — one shared mix value, not two independent fades

For the quad-fades-out-as-sphere-fades-in effect to look like a clean
symmetric crossfade rather than two meshes fading on slightly different
schedules, **one** smoothed 0–1 "sphere mode" value (computed from the
pinky gesture, with hysteresis) must drive both: quad opacity multiplies by
`(1 - mix)`, sphere opacity multiplies by `mix` — in addition to each mesh's
*existing* opacity-from-hands-visible fade (so a mesh only shows when both
"hands present" and "correct mode" hold). This value needs to be computed
once (likely in `App.tsx` or a small new hook) and passed to both
components — not computed independently inside each, which would risk the
two fades drifting apart from separately-seeded smoothing state.

### 5. Effects carrying over — duplicated, not shared

The four existing effect-gesture computations (pixelate/dither/aberration/
posterize mix values) currently live *inside* `LensQuad`'s `useFrame`. Per
`DECISION:` above, `LensSphere` gets its **own copy** of this same
computation rather than `LensQuad` being refactored to share it via a
lifted-out hook. This keeps `LensQuad` completely untouched (directly
serves "must not affect existing features"), at the cost of some duplicated
logic between the two components. In practice, since both read the same
corner positions with the same smoothing factors, the two copies would
track each other essentially exactly — any drift between them would be
theoretical, not something that'd actually be visible.

---

## Sub-phases

Mirroring the main plan's phase-by-phase, acceptance-gated style:

**Phase S0 — Right-pinky gesture detection (data only)**
Add `tracking/gestures.ts` with the right-pinky-extended check (landmark
math + hysteresis). Surface it in the debug overlay (e.g. on-screen text or
a colored indicator) so it can be verified against real hand poses before
anything renders differently.
*Acceptance:* indicator reliably flips on/off as the right pinky is raised
and lowered, across a few hand distances/rotations, doesn't flicker at the
boundary, and is unaffected by the *left* hand's pinky.

**Phase S1 — Sphere renders (no crossfade, no tracking yet)**
Hardcoded-visible sphere (`LensSphere`) at a fixed position/size, live video
wrapped via spherical UV, constant Y-axis rotation, basic lighting. De-risks
the texture-mapping + lighting technique in isolation, same spirit as the
original plan's Phase 4 (static rectangle before wiring tracking).
*Acceptance:* a rotating, lit, video-wrapped sphere renders correctly;
rotation is visibly meaningful (you can see the video content moving with
the surface, not swimming independently of it).

**Phase S2 — Position, size, and gesture wiring**
Sphere follows the real corner centroid and grows/shrinks with corner
spread; right-pinky-up shows it, right-pinky-down hides it (hard cut for
now — crossfade comes next phase, kept separate so each piece is verified
independently).
*Acceptance:* sphere tracks and resizes correctly with hand movement;
appears/disappears correctly with the pinky gesture.

**Phase S3 — Crossfade**
Shared mix value drives quad-out/sphere-in opacity simultaneously.
*Acceptance:* transition reads as a smooth dissolve between quad and
sphere, not a pop; works correctly in both directions (raising and
lowering the pinky).

**Phase S4 — Port the four effects onto the sphere**
Pixelate/dither/aberration/posterize logic translated from CSS-px/
screen-space math to the sphere's UV space, each still driven by their
existing gestures.
*Acceptance:* all four effects (and combinations) visibly work on the
sphere's surface, rotating with it.

**Phase S5 — Regression pass + polish**
Explicit check that with the right pinky never raised, the app is
byte-for-byte behaviorally identical to before this feature existed. Verify
resize handling, the <2-hands hide behavior while in sphere mode, and
general feel.
*Acceptance:* full walkthrough of the original plan's Phase 6 acceptance
checks, unchanged; sphere-specific behavior also holds up.

---

## Open questions / risks

- ~~Icosahedron UV seams/distortion~~ — moot: switched to a smooth
  `THREE.SphereGeometry` during Phase S1 (see Decisions baked in), which
  has clean equirectangular UVs with no seam/stretching concern.
- **Lighting quality.** A single fixed-direction light is a simple
  approximation; may need tuning once it's actually visible (Phase S1) to
  avoid looking flat or oddly lit depending on the video content.
