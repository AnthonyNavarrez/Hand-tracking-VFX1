// Tunables for hand tracking, mirroring, and lens behavior.

export const config = {
  numHands: 2,
  mirror: true,
  // Per-frame lerp factor (0-1) each lens corner moves toward its latest
  // tracked position. Lower = smoother/more lag, higher = snappier/more jitter.
  smoothingFactor: 0.25,
  fewerThanTwoHandsBehavior: "hide" as const,
};
