import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Corners } from './types';

const THUMB_TIP = 4;
const INDEX_TIP = 8;

function toScreen(landmark: NormalizedLandmark, width: number, height: number) {
  // Mirror x to match the CSS-flipped (selfie-view) video, per DECISION.
  return { x: (1 - landmark.x) * width, y: landmark.y * height };
}

/**
 * Resolves the 4 lens corners (LT, LI, RI, RT) from a hand-tracking result.
 * Requires exactly one detected Left hand and one detected Right hand;
 * returns null otherwise (fewer/more than two hands, or ambiguous
 * handedness) so callers can hide the lens per DECISION.
 */
export function getCorners(
  result: HandLandmarkerResult | null,
  width: number,
  height: number,
): Corners | null {
  if (!result || width === 0 || height === 0) return null;

  let leftHand: NormalizedLandmark[] | null = null;
  let rightHand: NormalizedLandmark[] | null = null;

  result.landmarks.forEach((landmarks, i) => {
    const label = result.handedness[i]?.[0]?.categoryName;
    if (label === 'Left' && !leftHand) leftHand = landmarks;
    else if (label === 'Right' && !rightHand) rightHand = landmarks;
  });

  if (!leftHand || !rightHand) return null;

  return [
    toScreen(leftHand[THUMB_TIP], width, height),
    toScreen(leftHand[INDEX_TIP], width, height),
    toScreen(rightHand[INDEX_TIP], width, height),
    toScreen(rightHand[THUMB_TIP], width, height),
  ];
}
