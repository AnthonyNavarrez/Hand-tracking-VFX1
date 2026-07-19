// Tunables for hand tracking, mirroring, and lens behavior.
// Placeholder values for Phase 0 — wired up as later phases consume them.

export const config = {
  numHands: 2,
  mirror: true,
  smoothingFactor: 0.5,
  fewerThanTwoHandsBehavior: "hide" as const,
};
