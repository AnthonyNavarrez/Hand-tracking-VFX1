// Tunables for hand tracking, mirroring, and lens behavior.

export const config = {
  numHands: 2,
  mirror: true,
  // Per-frame lerp factor (0-1) each lens corner moves toward its latest
  // tracked position. Lower = smoother/more lag, higher = snappier/more jitter.
  smoothingFactor: 0.25,
  fewerThanTwoHandsBehavior: "hide" as const,
  // Right index/thumb pinch (screen px, on the smoothed corners) that
  // toggles the lens fill between invert and pixelated invert on each
  // touch (tap, not hold). "On" arms the toggle when corners get this
  // close; "off" must be exceeded afterward to disarm it for the next
  // tap — hysteresis so one touch can't double-toggle from jitter.
  pixelatePinchOnDistance: 45,
  pixelatePinchOffDistance: 85,
  pixelateBlockSize: 16, // CSS px per pixelation block

  // Left index/thumb pinch — same tap-to-toggle/hysteresis behavior as
  // the pixelate pinch above, but toggles an ordered-dither fill instead.
  // Independent of the pixelate toggle; both can be on at once.
  ditherPinchOnDistance: 45,
  ditherPinchOffDistance: 85,
  ditherLevels: 3, // quantization levels per color channel; lower = coarser/more intense
  ditherCellSize: 3, // CSS px per Bayer matrix cell; higher = chunkier/more visible pattern

  // Chromatic aberration is a held pose, not a tap: active (smoothly
  // fading in/out) exactly while the left thumb sits at least this many
  // px (screen space, smoothed corners) above the left index tip (right
  // hand not considered). Replaces invert while active; still stacks
  // with pixelate/dither.
  aberrationPoseMargin: 15,
  // Max R/B channel sample split at the quad's edge, CSS px. Radial (see
  // lensShader), so the effective split at any point is this scaled by
  // its normalized distance from the quad's center — sharp in the
  // middle, more pronounced toward the edges.
  aberrationOffset: 40,
  // Animated ripple applied to the sample position while aberration is
  // active, fading in/out with it (not a separate trigger).
  aberrationDistortFrequency: 10, // ripple waves across the 0-1 screen UV range
  aberrationDistortSpeed: 2.5, // ripple animation speed
  aberrationDistortAmplitude: 0.01, // ripple displacement, fraction of stage size

  // Posterize is a held pose, not a tap: active (smoothly fading in/out)
  // exactly while the hands are crossed — right hand's corners (RI/RT)
  // sitting at least this many px (screen space, smoothed corners) to
  // the left of the left hand's corners (LI/LT). Stacks on top of
  // whichever fill (invert or aberration) is currently active.
  posterizeCrossMargin: 30,
  posterizeLevels: 3, // grayscale tone bands; lower = bolder/more graphic

  // LI/RI touch (the two index fingertips, one from each hand, touching)
  // toggles a super-saturation + slight hue-shift fill, tap not hold —
  // same tap-to-toggle/hysteresis behavior as the pixelate/dither pinches.
  // Stacks independently of them.
  saturationTouchOnDistance: 45,
  saturationTouchOffDistance: 85,
  saturationBoost: 2.5, // multiplier on the HSV saturation channel
  saturationHueShift: 0.04, // hue rotation, fraction of the full 360° wheel
  // Barrel-distortion strength for the fisheye POV look that fades in/out
  // together with the saturation toggle above (same trigger, no separate
  // gesture). >0 bulges the center outward/compresses the edges.
  fisheyeStrength: 0.8,

  // Right pinky raised is a held pose, detected from the ratio of
  // (pinky tip-to-MCP distance) / (wrist-to-middle-MCP distance) — scale-
  // normalized so it works at any distance from the camera, and rotation-
  // agnostic since it's a 3D distance ratio, not a Y-position check.
  // Hysteresis (on > off) so the boundary doesn't flicker.
  pinkyExtendedOnRatio: 0.75,
  pinkyExtendedOffRatio: 0.55,

  // Sphere radius (screen px) = average corner-to-centroid distance of the
  // 4 smoothed corners, scaled by this factor.
  sphereRadiusScale: 1,
  // Fixed translucency baked into the sphere's own surface (independent of
  // the hands-visible/crossfade opacity), so the raw video behind it shows
  // through. 1 = fully opaque, 0 = fully invisible. Kept well away from 0.5
  // on purpose: blending the sphere's inverted fill with the same
  // non-inverted video behind it cancels toward gray as this approaches
  // 0.5 (result = alpha + color*(1 - 2*alpha)), so this is picked high
  // (mostly opaque) to keep the inverted look's contrast intact.
  sphereSurfaceOpacity: 0.85,

  // Right-hand "open palm" (all 5 fingers extended) expands the sphere to
  // fill the screen. Same tip-to-MCP/hand-scale ratio technique as the
  // pinky gesture, applied to all 5 fingers — the thumb gets its own
  // (lower) thresholds since its extended ratio runs naturally shorter
  // than the other four fingers'.
  openHandFingerOnRatio: 0.7,
  openHandFingerOffRatio: 0.5,
  openHandThumbOnRatio: 0.4,
  openHandThumbOffRatio: 0.25,
  // Multiplier applied to the screen diagonal for the "fill the screen"
  // target radius — >1 so the sphere's edge clears the viewport with a
  // small margin rather than sitting exactly at the corners.
  sphereFullScreenMargin: 1.05,
  // Per-frame lerp factor (0-1) the radius grows toward the full-screen
  // target when the right hand opens. Deliberately much lower than
  // smoothingFactor so the fill-the-screen expansion reads as a slow
  // reveal rather than a quick pop; normal hand-driven resizing keeps
  // using smoothingFactor.
  sphereFullScreenGrowFactor: 0.05,

  // Left hand fully open (all 5 fingers extended) is a held pose that
  // swaps whichever of the quad/sphere is currently active for a
  // full-screen floating particle field: squares if the quad was active,
  // circles if the sphere was active. Takes priority over the pinky-only
  // rotation-follow gesture (an open hand always also satisfies "pinky
  // up") — rotation-follow only applies when just the pinky is up.
  handOpenFadeFactor: 0.15, // per-frame lerp pace for the crossfade in/out
  particleCount: 100,
  particleSize: 55, // CSS px, both squares and circles
  // Squares (quad-mode replacement): each wanders independently via a
  // per-particle sine-based drift, plus a shared swarm velocity nudged by
  // the left hand's own frame-to-frame screen movement (so moving the
  // hand visibly stirs the swarm) that decays back to zero over time.
  squareWanderSpeed: 0.6, // radians/sec through each particle's own sine phase
  squareWanderAmplitude: 60, // CSS px/sec
  squareHandInfluence: 8, // swarm velocity gained per px of hand movement
  squareSwarmDamping: 0.9, // per-frame decay factor on the hand-driven swarm velocity
  // Circles (sphere-mode replacement): each scattered at its own random,
  // fixed distance from the screen center, all swirling around the
  // center together via one shared rotation angle that always ticks
  // forward on its own. The left hand doesn't steer that rotation —
  // instead it locally repels whichever circles are currently near it.
  circleAutoRotationSpeed: 0.3, // radians/sec, constant baseline spin
  circleRepelRadius: 280, // CSS px — circles farther than this from the hand are unaffected
  circleRepelStrength: 3500, // px/sec^2-ish, force magnitude right at the hand, falling off to 0 at circleRepelRadius
  circleRepelDamping: 0.9, // per-frame decay factor on the repel displacement, so it springs back rather than sticking
  // Right hand open (all 5 fingers extended) pulls every circle toward
  // it instead of their usual orbit+repel position. Per-frame lerp factor
  // (0-1) for how quickly that pull engages/releases.
  circleAttractMixFactor: 0.08,
};
