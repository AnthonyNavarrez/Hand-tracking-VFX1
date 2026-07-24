import { useRef } from 'react';
import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useWindowSize } from '../hooks/useWindowSize';
import { getRightHandIndexTip, useRightIndexExtended } from '../tracking/gestures';
import { landmarkToScreen } from '../tracking/corners';
import { TiltedCard } from './TiltedCard';
import './ImageGallery.css';

// Row order follows the numeric filename suffix (nature1 → nature10),
// left to right, regardless of file extension.
const IMAGE_FILES = [
  'nature1.jpg',
  'nature2.jpg',
  'nature3.webp',
  'nature4.jpg',
  'nature5.avif',
  'nature6.jpeg',
  'nature7.webp',
  'nature8.webp',
  'nature9.webp',
  'nature10.webp',
];

function captionFor(file: string): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/(\d+)$/, ' $1');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function ImageGallery() {
  const { videoSize } = useCamera();
  const { result: handResult } = useTracking();
  const stageSize = useWindowSize();
  const rightIndexExtended = useRightIndexExtended(handResult);

  // Same technique as HandVfxTool's rightHandScreenPos, but only "armed"
  // while the right index finger is raised — the aim gesture. Lowering
  // it clears the pointer entirely, which cascades into no card being
  // hovered below.
  const rightIndexTipLandmark = getRightHandIndexTip(handResult);
  const pointerScreenPos =
    rightIndexExtended && rightIndexTipLandmark && videoSize
      ? landmarkToScreen(rightIndexTipLandmark, videoSize, stageSize)
      : null;

  const cardNodesRef = useRef(new Map<string, HTMLDivElement>());

  // Hover, per DECISION, is driven by the fingertip's X position against
  // each card's own rect — not full 2D containment — so a finger held
  // above or below the row still hovers whichever card it's over
  // horizontally, not just a finger placed exactly on the card. Vertical
  // distance only breaks ties, which can't happen yet with a single row
  // (every card shares one Y); it starts mattering once a selected
  // layout adds a second (bottom-row) tier.
  //
  // Computed inline (not via useEffect + setState) since ImageGallery
  // already re-renders on every tracking frame via TrackingContext — an
  // extra state round trip here would double-schedule updates off the
  // exact same input, tripping React's runaway-update safeguard.
  let hoveredFile: string | null = null;
  let hoveredRect: DOMRect | null = null;
  if (pointerScreenPos) {
    let bestDistY = Infinity;
    for (const [file, node] of cardNodesRef.current) {
      const rect = node.getBoundingClientRect();
      if (pointerScreenPos.x < rect.left || pointerScreenPos.x > rect.right) continue;
      const distY = Math.abs(pointerScreenPos.y - (rect.top + rect.bottom) / 2);
      if (distY < bestDistY) {
        bestDistY = distY;
        hoveredFile = file;
        hoveredRect = rect;
      }
    }
  }

  return (
    <div className="image-gallery-row">
      {IMAGE_FILES.map((file) => (
        <div
          key={file}
          className="image-gallery-card-slot"
          ref={(node) => {
            if (node) cardNodesRef.current.set(file, node);
            else cardNodesRef.current.delete(file);
          }}
        >
          <TiltedCard
            imageSrc={`/${file}`}
            altText={captionFor(file)}
            showTooltip={false}
            containerWidth="100%"
            containerHeight="100%"
            imageWidth="100%"
            imageHeight="100%"
            rotateAmplitude={10}
            scaleOnHover={1.4}
            // Y is clamped into the hovered card's own rect so the tilt
            // math (offsetY / rect.height) stays within its intended
            // range even when the raw fingertip sits well above/below
            // the card itself.
            pointerScreenPos={
              hoveredFile === file && hoveredRect && pointerScreenPos
                ? { x: pointerScreenPos.x, y: Math.min(Math.max(pointerScreenPos.y, hoveredRect.top), hoveredRect.bottom) }
                : null
            }
          />
        </div>
      ))}
    </div>
  );
}
