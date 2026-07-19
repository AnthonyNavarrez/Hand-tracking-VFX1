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
  // fading in/out) exactly while both thumbs sit at least this many px
  // (screen space, smoothed corners) above their own hand's index tip.
  // Replaces invert while active; still stacks with pixelate/dither.
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
};
