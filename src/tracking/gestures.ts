import { useRef } from 'react';
import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { config } from '../config';

const WRIST = 0;
const THUMB_MCP = 2;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;

function findHandByLabel(result: HandLandmarkerResult, label: 'Left' | 'Right'): NormalizedLandmark[] | null {
  for (let i = 0; i < result.landmarks.length; i++) {
    if (result.handedness[i]?.[0]?.categoryName === label) return result.landmarks[i];
  }
  return null;
}

/** Wrist-to-middle-MCP distance — a stand-in for palm size, used to
 * normalize finger-extension ratios so they work at any distance from the
 * camera. */
function getHandScale(hand: NormalizedLandmark[]): number {
  const wrist = hand[WRIST];
  const middleMcp = hand[MIDDLE_MCP];
  return Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z);
}

/** Ratio = fingertip-to-MCP distance / hand scale: large when the finger is
 * extended straight out, small when curled back toward the palm — not a
 * simple Y-position check, so it works at any hand rotation. */
function getFingerExtensionRatio(hand: NormalizedLandmark[], tipIndex: number, mcpIndex: number, handScale: number) {
  const tip = hand[tipIndex];
  const mcp = hand[mcpIndex];
  return Math.hypot(tip.x - mcp.x, tip.y - mcp.y, tip.z - mcp.z) / handScale;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Single-finger-extended detection for either hand, normalized by hand
 * scale (not a simple Y-position check) so it works at any distance from
 * the camera and at any hand rotation. Ratio = fingertip-to-MCP distance /
 * wrist-to-middle-MCP distance (a stand-in for palm size): large when the
 * finger is extended straight out, small when curled back toward the palm.
 *
 * Hysteresis (separate on/off thresholds), same pattern as the existing
 * pinch/pose gestures, so the boundary doesn't flicker. State is kept in a
 * ref across frames, reset whenever the given hand isn't tracked.
 */
function useFingerExtended(
  result: HandLandmarkerResult | null,
  label: 'Left' | 'Right',
  tipIndex: number,
  mcpIndex: number,
  onRatio: number,
  offRatio: number,
): boolean {
  const extendedRef = useRef(false);

  const hand = result ? findHandByLabel(result, label) : null;

  if (!hand) {
    extendedRef.current = false;
    return false;
  }

  const handScale = getHandScale(hand);
  if (handScale < 1e-6) return extendedRef.current;

  const ratio = getFingerExtensionRatio(hand, tipIndex, mcpIndex, handScale);

  if (!extendedRef.current && ratio > onRatio) {
    extendedRef.current = true;
  } else if (extendedRef.current && ratio < offRatio) {
    extendedRef.current = false;
  }

  return extendedRef.current;
}

export function useRightPinkyExtended(result: HandLandmarkerResult | null): boolean {
  return useFingerExtended(result, 'Right', PINKY_TIP, PINKY_MCP, config.pinkyExtendedOnRatio, config.pinkyExtendedOffRatio);
}

export function useLeftPinkyExtended(result: HandLandmarkerResult | null): boolean {
  return useFingerExtended(result, 'Left', PINKY_TIP, PINKY_MCP, config.pinkyExtendedOnRatio, config.pinkyExtendedOffRatio);
}

export function useRightIndexExtended(result: HandLandmarkerResult | null): boolean {
  return useFingerExtended(
    result,
    'Right',
    INDEX_TIP,
    INDEX_MCP,
    config.indexExtendedOnRatio,
    config.indexExtendedOffRatio,
  );
}

export function useRightMiddleExtended(result: HandLandmarkerResult | null): boolean {
  return useFingerExtended(
    result,
    'Right',
    MIDDLE_TIP,
    MIDDLE_MCP,
    config.middleExtendedOnRatio,
    config.middleExtendedOffRatio,
  );
}

/**
 * "Open palm" (all 5 fingers extended) detection for either hand — same
 * tip-to-MCP/hand-scale ratio technique as the pinky gesture, applied to
 * all 5 fingers. The thumb gets its own (lower) threshold since its
 * extended tip-to-MCP distance is naturally shorter than the other four
 * fingers' even when fully extended, due to its shape/attachment point.
 *
 * Hysteresis: arms "open" only once every finger clears its own (higher)
 * on-threshold; disarms as soon as any single finger drops below its
 * (lower) off-threshold — so one finger relaxing slightly doesn't
 * immediately cancel the gesture, but curling any finger noticeably does.
 *
 * Requiring 5 independent ratios to simultaneously clear a threshold is
 * fragile against per-frame landmark jitter — a single noisy frame on any
 * one finger would otherwise flip the whole gesture off immediately after
 * arming. Each ratio is smoothed (same technique as corner tracking)
 * before the comparison, so single-frame noise doesn't reach the
 * threshold check at all.
 */
function useHandOpen(result: HandLandmarkerResult | null, label: 'Left' | 'Right'): boolean {
  const openRef = useRef(false);
  const smoothedRef = useRef<{
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  } | null>(null);

  const hand = result ? findHandByLabel(result, label) : null;

  if (!hand) {
    openRef.current = false;
    smoothedRef.current = null;
    return false;
  }

  const handScale = getHandScale(hand);
  if (handScale < 1e-6) return openRef.current;

  const raw = {
    thumb: getFingerExtensionRatio(hand, THUMB_TIP, THUMB_MCP, handScale),
    index: getFingerExtensionRatio(hand, INDEX_TIP, INDEX_MCP, handScale),
    middle: getFingerExtensionRatio(hand, MIDDLE_TIP, MIDDLE_MCP, handScale),
    ring: getFingerExtensionRatio(hand, RING_TIP, RING_MCP, handScale),
    pinky: getFingerExtensionRatio(hand, PINKY_TIP, PINKY_MCP, handScale),
  };

  const prev = smoothedRef.current;
  const smoothed = prev
    ? {
        thumb: lerp(prev.thumb, raw.thumb, config.smoothingFactor),
        index: lerp(prev.index, raw.index, config.smoothingFactor),
        middle: lerp(prev.middle, raw.middle, config.smoothingFactor),
        ring: lerp(prev.ring, raw.ring, config.smoothingFactor),
        pinky: lerp(prev.pinky, raw.pinky, config.smoothingFactor),
      }
    : raw; // snap on first acquisition, no lerp-in from nothing
  smoothedRef.current = smoothed;

  const { openHandFingerOnRatio, openHandFingerOffRatio, openHandThumbOnRatio, openHandThumbOffRatio } = config;

  const allExtended =
    smoothed.thumb > openHandThumbOnRatio &&
    smoothed.index > openHandFingerOnRatio &&
    smoothed.middle > openHandFingerOnRatio &&
    smoothed.ring > openHandFingerOnRatio &&
    smoothed.pinky > openHandFingerOnRatio;

  const anyCurled =
    smoothed.thumb < openHandThumbOffRatio ||
    smoothed.index < openHandFingerOffRatio ||
    smoothed.middle < openHandFingerOffRatio ||
    smoothed.ring < openHandFingerOffRatio ||
    smoothed.pinky < openHandFingerOffRatio;

  if (!openRef.current && allExtended) {
    openRef.current = true;
  } else if (openRef.current && anyCurled) {
    openRef.current = false;
  }

  return openRef.current;
}

export function useRightHandOpen(result: HandLandmarkerResult | null): boolean {
  return useHandOpen(result, 'Right');
}

export function useLeftHandOpen(result: HandLandmarkerResult | null): boolean {
  return useHandOpen(result, 'Left');
}

/**
 * Screen-space angle (radians) of the left hand's wrist-to-pinky-tip
 * direction — x mirrored to match the mirrored (selfie-view) video and y
 * flipped to a conventional y-up angle. Not a hook (no hysteresis/smoothed
 * state needed here — any smoothing happens downstream, in LensSphere,
 * where it's blended against the sphere's own auto-rotation angle).
 * Returns null when the left hand isn't tracked.
 */
export function getLeftHandPinkyAngle(result: HandLandmarkerResult | null): number | null {
  const leftHand = result ? findHandByLabel(result, 'Left') : null;
  if (!leftHand) return null;

  const wrist = leftHand[WRIST];
  const pinkyTip = leftHand[PINKY_TIP];
  const dx = wrist.x - pinkyTip.x; // mirrored
  const dy = wrist.y - pinkyTip.y; // flipped to y-up
  return Math.atan2(dy, dx);
}

/** Raw wrist landmark of the left hand, or null if not tracked — for
 * converting to screen space via landmarkToScreen (see tracking/corners). */
export function getLeftHandWrist(result: HandLandmarkerResult | null): NormalizedLandmark | null {
  const leftHand = result ? findHandByLabel(result, 'Left') : null;
  return leftHand ? leftHand[WRIST] : null;
}

/** Raw index fingertip landmark of the right hand, or null if not tracked —
 * for converting to screen space via landmarkToScreen (see
 * tracking/corners). */
export function getRightHandIndexTip(result: HandLandmarkerResult | null): NormalizedLandmark | null {
  const rightHand = result ? findHandByLabel(result, 'Right') : null;
  return rightHand ? rightHand[INDEX_TIP] : null;
}

/** Wrist + all 5 fingertip landmarks of the left hand, or null if not
 * tracked — for effects (like the particle-repel field) that should react
 * to the whole spread of an open hand, not just a single wrist point. */
export function getLeftHandKeyPoints(result: HandLandmarkerResult | null): NormalizedLandmark[] | null {
  const leftHand = result ? findHandByLabel(result, 'Left') : null;
  if (!leftHand) return null;
  return [
    leftHand[WRIST],
    leftHand[THUMB_TIP],
    leftHand[INDEX_TIP],
    leftHand[MIDDLE_TIP],
    leftHand[RING_TIP],
    leftHand[PINKY_TIP],
  ];
}
