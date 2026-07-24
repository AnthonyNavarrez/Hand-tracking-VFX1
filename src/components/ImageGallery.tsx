import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useWindowSize } from '../hooks/useWindowSize';
import { getRightHandIndexTip, getRightHandThumbTip, useRightIndexExtended } from '../tracking/gestures';
import { landmarkToScreen } from '../tracking/corners';
import { config } from '../config';
import { GALLERY_IMAGE_FILES, galleryImageCaption } from '../data/galleryImages';
import { TiltedCard } from './TiltedCard';
import './ImageGallery.css';

export function ImageGallery() {
  const { videoSize } = useCamera();
  const { result: handResult } = useTracking();
  const stageSize = useWindowSize();
  const rightIndexExtended = useRightIndexExtended(handResult);

  const rightIndexTipLandmark = getRightHandIndexTip(handResult);
  const rightIndexTipScreenPos =
    rightIndexTipLandmark && videoSize ? landmarkToScreen(rightIndexTipLandmark, videoSize, stageSize) : null;

  // Same technique as HandVfxTool's rightHandScreenPos, but only "armed"
  // while the right index finger is raised — the aim gesture. Lowering
  // it clears the pointer entirely, which cascades into no card being
  // hovered below.
  const pointerScreenPos = rightIndexExtended ? rightIndexTipScreenPos : null;

  const rightThumbTipLandmark = getRightHandThumbTip(handResult);
  const rightThumbScreenPos =
    rightThumbTipLandmark && videoSize ? landmarkToScreen(rightThumbTipLandmark, videoSize, stageSize) : null;
  // Raw index/thumb distance, independent of rightIndexExtended — a pinch
  // (tips touching) is a distinct pose from "finger held out straight",
  // so it shouldn't be starved by the aim gesture's own threshold.
  const pinchDistance =
    rightIndexTipScreenPos && rightThumbScreenPos
      ? Math.hypot(rightIndexTipScreenPos.x - rightThumbScreenPos.x, rightIndexTipScreenPos.y - rightThumbScreenPos.y)
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

  // The pinch-tap handler (below) needs to know "what was hovered at the
  // moment the tap fired", but hoveredFile itself is a plain render-time
  // value, not state — this ref just carries the latest one forward so
  // the effect can read it without adding it as a dependency (which,
  // being a plain string/null, would be safe to depend on anyway, but
  // the ref keeps the pinch effect solely triggered by pinchDistance).
  const hoveredFileRef = useRef<string | null>(null);
  hoveredFileRef.current = hoveredFile;

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const isPinchTouchingRef = useRef(false);

  // RI/RT pinch tap-toggle (same hysteresis pattern as LensQuad's own
  // pinches): select/deselect/swap per Core architecture §2, evaluated
  // against whatever was hovered at the moment the tap crosses the "on"
  // threshold. A plain number dependency (not an object recomputed every
  // render) so this only re-runs when the tracked distance actually
  // changes, not on every render.
  useEffect(() => {
    if (pinchDistance === null) {
      isPinchTouchingRef.current = false;
      return;
    }
    const { gallerySelectPinchOnDistance, gallerySelectPinchOffDistance } = config;
    if (!isPinchTouchingRef.current && pinchDistance < gallerySelectPinchOnDistance) {
      isPinchTouchingRef.current = true;
      const hovered = hoveredFileRef.current;
      if (hovered !== null) {
        setSelectedFile((prev) => {
          if (prev === null) return hovered; // select
          if (hovered === prev) return null; // deselect
          return hovered; // swap
        });
      }
    } else if (isPinchTouchingRef.current && pinchDistance > gallerySelectPinchOffDistance) {
      isPinchTouchingRef.current = false;
    }
  }, [pinchDistance]);

  // Shared layoutId per card (its filename) is what lets Framer Motion
  // FLIP-animate a card between the row and selected layouts below, even
  // though it moves to a different DOM parent (and gets a fresh TiltedCard
  // instance, resetting its own hover springs) when selection changes.
  function renderCard(file: string) {
    return (
      <motion.div
        key={file}
        layoutId={file}
        layout
        className="image-gallery-card-slot"
        ref={(node) => {
          if (node) cardNodesRef.current.set(file, node);
          else cardNodesRef.current.delete(file);
        }}
      >
        <TiltedCard
          imageSrc={`/${file}`}
          altText={galleryImageCaption(file)}
          showTooltip={false}
          containerWidth="100%"
          containerHeight="100%"
          imageWidth="100%"
          imageHeight="100%"
          rotateAmplitude={10}
          scaleOnHover={1.4}
          // Y is clamped into the hovered card's own rect so the tilt
          // math (offsetY / rect.height) stays within its intended range
          // even when the raw fingertip sits well above/below the card
          // itself.
          pointerScreenPos={
            hoveredFile === file && hoveredRect && pointerScreenPos
              ? { x: pointerScreenPos.x, y: Math.min(Math.max(pointerScreenPos.y, hoveredRect.top), hoveredRect.bottom) }
              : null
          }
        />
      </motion.div>
    );
  }

  return (
    <>
      {selectedFile === null ? (
        <div className="image-gallery-row">{GALLERY_IMAGE_FILES.map(renderCard)}</div>
      ) : (
        <div className="image-gallery-selected-layout">
          <div className="image-gallery-selected-slot">{renderCard(selectedFile)}</div>
          <div className="image-gallery-bottom-row">
            {GALLERY_IMAGE_FILES.filter((file) => file !== selectedFile).map(renderCard)}
          </div>
        </div>
      )}

      {/* Started as Phase T6's optional debug readout, brought forward in
          T4 to confirm the pinch state machine before this layout existed
          — kept on since it's still handy for tuning hover/select. */}
      <div className="image-gallery-debug">
        Hover: {hoveredFile ?? '—'} · Selected: {selectedFile ?? '—'}
      </div>
    </>
  );
}
