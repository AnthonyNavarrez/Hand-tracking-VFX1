# Hand-Tracked Lens Effect — Build Plan

A web app where a quadrilateral pinned to your fingertips acts as a **lens**: everything inside the quad shows the live webcam feed with **inverted colors**, while everything outside stays normal. The four corners follow your **left thumb, left index, right index, right thumb**. Move your hands and the inverted-color rectangle stretches and warps between them.

---

## How to use this document (for Claude Code)

- Build **phase by phase, in order**. Each phase has an **Acceptance check** — do not move to the next phase until the current one passes.
- **Commit after every phase.** Each phase should leave the app in a runnable state.
- The trickiest part is Phase 4 (the lens illusion) and the coordinate alignment in Phase 3/5 — read the **Core architecture** and **Alignment notes** sections before starting those.
- If a decision is marked `DECISION:`, it reflects a default chosen by the project owner; don't silently change it.

---

## Effect summary

- **Lens look** (not stretch): the region inside the quad shows the *actual video pixels behind that screen area*, inverted. The quad is a filter you drag around over the live feed — the video does **not** get squished into the quad.
- **Effect inside:** color inversion → `outputColor.rgb = 1.0 - videoColor.rgb`.
- **Corners (in perimeter order, so the shape never folds into a bowtie):**
  1. Left thumb tip — landmark `4`
  2. Left index tip — landmark `8`
  3. Right index tip — landmark `8`
  4. Right thumb tip — landmark `4`

---

## Tech stack & key decisions

| Concern | Choice |
|---|---|
| Bundler / framework | Vite + React + TypeScript |
| Hand tracking | `@mediapipe/tasks-vision` → `HandLandmarker` (2 hands, video mode) |
| Rendering | `three` + `@react-three/fiber` (`DECISION:` r3f — chosen to match a React mental model and keep components declarative) |
| Effect | Custom `ShaderMaterial` (fragment shader samples video by **screen UV** and inverts) |
| Deploy | Vercel (HTTPS is required for camera access) |

**Why Three.js and not a 2D canvas:** the lens needs a per-pixel shader sampling a video texture. Three.js gives us a clean `VideoTexture` + fragment-shader path and leaves room for fancier effects later (blur, RGB-split, feathered edges).

---

## Prerequisites

- Node 18+ and npm.
- A webcam. Test in Chrome first (best MediaPipe + WebGL support).
- Camera access requires a **secure context**: `localhost` works in dev; production must be HTTPS (Vercel handles this).

Install (after scaffolding):

```
npm install three @react-three/fiber @mediapipe/tasks-vision
npm install -D @types/three
```

MediaPipe assets (load from CDN, no bundling needed):
- WASM: resolved via `FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm")`
- Model: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`

---

## Proposed project structure

```
src/
  App.tsx                 # top-level layout: <video> background + <Canvas> overlay
  hooks/
    useWebcam.ts          # getUserMedia, returns a ready <video> element + stream
    useHandLandmarker.ts  # loads MediaPipe, runs detectForVideo loop, emits landmarks
  tracking/
    corners.ts           # landmarks -> 4 ordered corners (+ handedness handling, smoothing)
    types.ts             # Landmark, Handedness, Corners types
  scene/
    LensQuad.tsx         # the r3f mesh: geometry driven by corners, invert shader material
    lensShader.ts        # vertex + fragment shader source (screen-UV sampling + invert)
  debug/
    DebugOverlay.tsx     # 2D canvas dots on landmarks (dev-only, toggle with a key)
  config.ts              # tunables: numHands, smoothing factor, mirror, fallback behavior
```

---

## Core architecture — how the lens illusion works

The illusion is achieved with **two layers that share one video source**:

1. **Background layer** — an HTML `<video>` element showing the raw webcam feed, positioned behind the WebGL canvas.
2. **Overlay layer** — a **transparent** `<Canvas>` on top. It renders only the quad. The quad's fragment shader samples a `THREE.VideoTexture` (made from the *same* `<video>` element) at the fragment's **screen position** (`gl_FragCoord.xy / resolution`), then inverts it.

Because the quad samples the video at the screen coordinates it's actually covering, the inverted region lines up pixel-for-pixel with the feed behind it → it reads as a lens, not a stretched texture. Everywhere the canvas isn't drawing the quad, it's transparent, so the normal video shows through.

**Key implication:** the shader must use **screen-space UVs**, *not* the mesh's own UVs. (Mesh UVs would give the "stretch" look — the wrong one here.)

Camera setup: use an **orthographic camera** whose coordinate space maps 1:1 to the canvas in normalized/screen space, so we can position the quad's four vertices directly from screen-space corner coordinates each frame.

---

## Alignment notes (read before Phase 3–5)

These are the things that most commonly cause the quad to land in the wrong place:

- **MediaPipe coordinates** are normalized `[0,1]`, origin **top-left**, `x` rightward, `y` downward. Three.js/NDC is origin-center, `y` upward. Convert deliberately.
- **Mirrored (selfie) feed:** `DECISION:` the webcam is shown mirrored. The `<video>` is CSS-flipped (`scaleX(-1)`), and landmark `x` must be flipped (`x → 1 - x`) so the quad tracks correctly. Bonus: MediaPipe reports handedness *assuming a mirrored image*, so with the feed mirrored its `Left`/`Right` labels line up with the user's real hands — but still verify empirically, since a mismatch here is the likeliest bug.
- **Cover-crop mismatch:** if the `<video>` is displayed with `object-fit: cover`, part of the frame is cropped, so normalized landmark coords won't map linearly to displayed pixels. To avoid this in early phases, **size the canvas to the video's actual rendered rectangle** (same box, same aspect) so screen UVs and landmark coords share one coordinate space. Handle the robust cover-math version in Phase 6.
- **Corner ordering:** always LT → LI → RI → RT. Build the mesh as two triangles: `(LT, LI, RI)` and `(LT, RI, RT)`. (It can still self-intersect if the user crosses their hands — acceptable for v1.)

---

## Git & version control

**The repo is already set up** — initialized, `main` branch, GitHub remote connected, with only a `README.md` committed so far. Do **not** re-init or re-add the remote. Commit once per completed phase (after its acceptance check passes) and push — this keeps every commit in a runnable state and makes it easy to roll back a phase.

> **Scaffold note:** because the folder already contains `README.md` and `.git/`, scaffold Vite into the **current directory** (`.`). It'll warn the directory isn't empty — proceed; it keeps existing files.

### `.gitignore`

Vite scaffolds a `.gitignore` automatically; make sure it covers all of the following (add anything missing):

```gitignore
# Dependencies
node_modules/

# Build output
dist/
dist-ssr/

# Local env files (secrets)
.env
.env.local
.env.*.local

# Vercel CLI (local project link)
.vercel

# Editor / IDE
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/

# OS junk
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Misc local
*.local
coverage/
```

### `.gitattributes`

Add this to normalize line endings to LF across Windows / WSL / macOS. It prevents noisy whole-file diffs and the CRLF/encoding surprises that show up when switching environments:

```gitattributes
* text=auto eol=lf
```

### What to commit vs. ignore

- **Commit `package-lock.json`** — do *not* ignore it. It pins exact dependency versions so installs are reproducible (and so Vercel builds match local).
- **Do not commit `node_modules/` or `dist/`** — both are regenerated (`npm install`, `npm run build`).
- **`.vercel` is ignored** — it's created by the Vercel CLI and holds local link info. Deployment runs from GitHub, so you never commit it.
- **Secrets:** this project has none (MediaPipe loads from a public CDN, there's no backend/API key), but `.env*` files are ignored by default in case that changes — never commit real secrets.
- **MediaPipe model:** loaded from the Google CDN, so nothing to track. *If* you later vendor `hand_landmarker.task` into `public/` for offline use, it's a small static binary (a few MB) — fine to commit normally; Git LFS is optional and not needed at this size.

### Workflow suggestions

- **Commit cadence:** one commit per phase, e.g. `feat: phase 2 — mediapipe hand tracking`. Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`) keep history readable.
- **Branching (optional):** for a solo build, committing straight to `main` per phase is fine. If you want cleaner isolation, use a short-lived branch per phase (`phase-2-tracking`) and merge to `main` once its acceptance check passes.
- **Push per phase:** the GitHub repo and remote already exist, so just push after each phase's commit. Vercel connects to this same repo later (Phase 7) with zero extra setup.
- **Guard against tracking `node_modules`:** ensure `.gitignore` is in place before the first scaffold commit. If `node_modules/` ever gets committed by accident, fix with `git rm -r --cached node_modules` then commit.

---

## Build phases

### Phase 0 — Project setup
**Goal:** a running Vite + React + TS app in the existing repo.
- The repo **already exists**: initialized, `main` branch, GitHub remote connected, with only a `README.md` committed so far. Do **not** run `git init` or add a remote.
- Scaffold with the Vite React-TS template **into the current directory** (use `.` as the target). Vite will warn the folder isn't empty (because of `README.md` and `.git/`) — that's expected; proceed and keep those files.
- Install dependencies (above).
- Add `config.ts` with placeholder tunables.
- Add/extend `.gitignore` and add `.gitattributes` (see **Git & version control** below) **before** the first scaffold commit, so `node_modules/` is never tracked.
- Commit and push to `origin/main`.

**Acceptance:** `npm run dev` serves a blank app with no console errors; `git status` is clean after committing, `node_modules/` is untracked, and the commit is pushed to `origin/main`.

---

### Phase 1 — Webcam feed
**Goal:** see yourself on screen.
- `useWebcam.ts`: request camera via `getUserMedia({ video: true })`, attach the stream to a `<video>` (autoplay, muted, playsInline), resolve once metadata is loaded.
- Render the `<video>` full-container as the background layer.
- Apply mirror via CSS (`scaleX(-1)`) per `DECISION:`.

**Acceptance:** your live (mirrored/selfie) webcam shows on screen; camera permission prompt works.

---

### Phase 2 — Hand tracking (data only, no effect yet)
**Goal:** prove tracking works and coordinates are correct.
- `useHandLandmarker.ts`: init `FilesetResolver` + `HandLandmarker.createFromOptions` with `numHands: 2`, `runningMode: "VIDEO"`, GPU delegate.
- Run a `requestAnimationFrame` loop calling `detectForVideo(video, timestamp)`.
- Add `debug/DebugOverlay.tsx`: draw dots on **all 21 landmarks per hand** on a 2D canvas over the video (dev-only, toggle with a key).

**Acceptance:** dots sit accurately on your hands. Confirm thumb tip (`4`) and index tip (`8`) land correctly on **both** hands.

---

### Phase 3 — Extract the 4 corners
**Goal:** turn raw landmarks into 4 correctly-labeled, ordered points.
- `corners.ts`: identify left vs right hand (with mirror-aware handedness), pull landmarks `4` and `8` from each.
- Produce corners in order LT → LI → RI → RT, converted to the canvas/screen coordinate space.
- Handle the **fewer-than-two-hands** case per `DECISION:` (see open decisions).
- Show the 4 corners distinctly in the debug overlay (e.g. larger colored dots) to verify.

**Acceptance:** exactly 4 stable, correctly-labeled corner points appear on the right fingertips; the <2-hands fallback behaves as specified.

---

### Phase 4 — Three.js overlay + static inverted lens
**Goal:** get the lens illusion working on a *fixed* rectangle first (de-risks the shader before adding motion).
- Add a transparent r3f `<Canvas>` overlaying the video; orthographic camera in screen space.
- Create a `THREE.VideoTexture` from the same `<video>` element.
- `lensShader.ts`: fragment shader samples the video texture at **screen UV** (`gl_FragCoord.xy / uResolution`), outputs `1.0 - rgb`. Account for mirror/aspect so the sampled pixels align with the mirrored background.
- `LensQuad.tsx`: render a **hardcoded** rectangle using this material.

**Acceptance:** a fixed rectangle shows inverted video that lines up exactly with the feed behind it; outside the rectangle the video is untouched.

---

### Phase 5 — Drive the quad from the hands
**Goal:** the lens follows your fingertips.
- Each frame, update `LensQuad`'s geometry: set the 4 vertex positions from the 4 corner points from Phase 3.
- Wire the tracking loop → corners → geometry update.

**Acceptance:** the inverted-color rectangle stretches between your four fingertips and stays aligned as you move.

---

### Phase 6 — Polish & robustness
**Goal:** make it feel good and handle edge cases.
- **Smoothing:** reduce jitter by smoothing corner positions (start with per-corner lerp toward the new value; upgrade to a One Euro filter if needed).
- **Show/hide** logic for the <2-hands case (with a fade if chosen).
- **Robust alignment:** implement the full `object-fit: cover` mapping so it's correct at any window size; handle `resize`.
- Optional niceties: thin border stroke on the quad, feathered/soft lens edge, an FPS counter.

**Acceptance:** smooth and stable; correct at different window sizes; graceful when hands enter/leave frame.

---

### Phase 7 — Deploy
**Goal:** a shareable live link.
- Push to GitHub, connect Vercel, deploy (HTTPS is automatic — needed for camera).
- Test on a phone.
- Write a short README (what it is, how to run, browser support notes).

**Acceptance:** the deployed URL works on desktop and mobile; camera prompt and effect function over HTTPS.

---

## Data types (sketch)

```ts
type Landmark = { x: number; y: number; z: number };        // normalized [0,1], top-left origin
type Handedness = "Left" | "Right";
type Corner = { x: number; y: number };                     // screen/canvas space
type Corners = [Corner, Corner, Corner, Corner];            // ordered: LT, LI, RI, RT
```

---

## Known gotchas

- **HTTPS for camera:** `getUserMedia` only works on `localhost` or HTTPS. Deploy target must be secure.
- **VideoTexture needs a playing video:** the texture is black until the `<video>` is actually playing; gate texture creation on the video being ready.
- **Handedness + mirror consistency:** the single most likely bug. With the feed mirrored (and landmark `x` flipped), verify the quad tracks the intended fingers; keep the mirror flip and the handedness handling consistent in `corners.ts`.
- **Screen UV vs mesh UV:** sampling by mesh UV gives the wrong (stretch) look. Must sample by screen position.
- **iOS Safari:** requires `playsInline` + `muted` on the video for autoplay; test separately.
- **MediaPipe timestamp:** `detectForVideo` needs a monotonically increasing timestamp; feed it `performance.now()` or the rAF time.
- **Performance:** if the tracking loop and render loop fight, throttle detection (e.g. detect at 30fps, render at display rate) and reuse the latest corners.

---

## Decisions baked in (change here if wrong)

- `DECISION:` **react-three-fiber** (not vanilla three.js).
- `DECISION:` **Mirrored (selfie)** webcam view — CSS `scaleX(-1)` and landmark `x → 1 - x`; MediaPipe's mirror-based handedness then matches the user's real hands.
- `DECISION:` **Fewer-than-two-hands → hide the lens** until both hands return. *(Alternatives: freeze last position, or fade out.)*

## Stretch goals (post-v1)

- Snap to a true right-angled rectangle regardless of finger positions.
- Feathered / soft lens edge instead of a hard boundary.
- Switchable effects inside the lens (pixelate, blur, RGB-split, grayscale).
- Multiple lenses / more than two hands.
