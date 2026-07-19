import { useRef } from 'react';
import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { config } from '../config';

const WRIST = 0;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const PINKY_TIP = 20;

function findHandByLabel(result: HandLandmarkerResult, label: 'Left' | 'Right'): NormalizedLandmark[] | null {
  for (let i = 0; i < result.landmarks.length; i++) {
    if (result.handedness[i]?.[0]?.categoryName === label) return result.landmarks[i];
  }
  return null;
}

/**
 * Right-hand pinky-extended detection, normalized by hand scale (not a
 * simple Y-position check) so it works at any distance from the camera and
 * at any hand rotation — "pinky up" can happen with the hand at many
 * angles, unlike the thumb-above-index gesture. Ratio = pinky tip-to-MCP
 * distance / wrist-to-middle-MCP distance (a stand-in for palm size):
 * large when the finger is extended straight out, small when curled back
 * toward the palm.
 *
 * Hysteresis (separate on/off thresholds), same pattern as the existing
 * pinch/pose gestures, so the boundary doesn't flicker. State is kept in a
 * ref across frames, reset whenever the right hand isn't tracked.
 */
export function useRightPinkyExtended(result: HandLandmarkerResult | null): boolean {
  const extendedRef = useRef(false);

  const rightHand = result ? findHandByLabel(result, 'Right') : null;

  if (!rightHand) {
    extendedRef.current = false;
    return false;
  }

  const wrist = rightHand[WRIST];
  const middleMcp = rightHand[MIDDLE_MCP];
  const handScale = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z);
  if (handScale < 1e-6) return extendedRef.current;

  const pinkyMcp = rightHand[PINKY_MCP];
  const pinkyTip = rightHand[PINKY_TIP];
  const pinkyLength = Math.hypot(pinkyTip.x - pinkyMcp.x, pinkyTip.y - pinkyMcp.y, pinkyTip.z - pinkyMcp.z);
  const ratio = pinkyLength / handScale;

  const { pinkyExtendedOnRatio, pinkyExtendedOffRatio } = config;
  if (!extendedRef.current && ratio > pinkyExtendedOnRatio) {
    extendedRef.current = true;
  } else if (extendedRef.current && ratio < pinkyExtendedOffRatio) {
    extendedRef.current = false;
  }

  return extendedRef.current;
}
