import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Corner, Corners } from './types';

const THUMB_TIP = 4;
const INDEX_TIP = 8;

export type Size = { width: number; height: number };

/**
 * Maps a normalized landmark to screen/canvas space (CSS px, top-left
 * origin), accounting for the `object-fit: cover` crop between the video's
 * native resolution and the (differently-aspect-ratioed) stage, plus the
 * mirror flip for the CSS-flipped (selfie-view) video, per DECISION.
 */
export function landmarkToScreen(landmark: NormalizedLandmark, videoSize: Size, stageSize: Size): Corner {
  const scale = Math.max(stageSize.width / videoSize.width, stageSize.height / videoSize.height);
  const displayedWidth = videoSize.width * scale;
  const displayedHeight = videoSize.height * scale;
  const offsetX = (displayedWidth - stageSize.width) / 2;
  const offsetY = (displayedHeight - stageSize.height) / 2;

  const mirroredX = 1 - landmark.x;
  return {
    x: mirroredX * displayedWidth - offsetX,
    y: landmark.y * displayedHeight - offsetY,
  };
}

/**
 * Resolves the 4 lens corners (LT, LI, RI, RT) from a hand-tracking result.
 * Requires exactly one detected Left hand and one detected Right hand;
 * returns null otherwise (fewer/more than two hands, or ambiguous
 * handedness) so callers can hide the lens per DECISION.
 */
export function getCorners(
  result: HandLandmarkerResult | null,
  videoSize: Size | null,
  stageSize: Size,
): Corners | null {
  if (!result || !videoSize || stageSize.width === 0 || stageSize.height === 0) return null;

  let leftHand: NormalizedLandmark[] | null = null;
  let rightHand: NormalizedLandmark[] | null = null;

  result.landmarks.forEach((landmarks, i) => {
    const label = result.handedness[i]?.[0]?.categoryName;
    if (label === 'Left' && !leftHand) leftHand = landmarks;
    else if (label === 'Right' && !rightHand) rightHand = landmarks;
  });

  if (!leftHand || !rightHand) return null;

  return [
    landmarkToScreen(leftHand[THUMB_TIP], videoSize, stageSize),
    landmarkToScreen(leftHand[INDEX_TIP], videoSize, stageSize),
    landmarkToScreen(rightHand[INDEX_TIP], videoSize, stageSize),
    landmarkToScreen(rightHand[THUMB_TIP], videoSize, stageSize),
  ];
}
