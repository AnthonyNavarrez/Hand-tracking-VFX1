import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import './TiltedCard.css';

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2,
};

// Snappier than springValues (lower mass, higher stiffness) — used only
// for the hover/dehover pop (scale + opacity), which should feel quick,
// while the tilt-follow rotation keeps the slower springValues above for
// a smoother, less twitchy pointer-tracking feel.
const enterLeaveSpringValues = {
  damping: 30,
  stiffness: 400,
  mass: 0.5,
};

type ScreenPos = { x: number; y: number } | null;

type TiltedCardProps = {
  imageSrc: string;
  altText?: string;
  captionText?: string;
  containerHeight?: string;
  containerWidth?: string;
  imageHeight?: string;
  imageWidth?: string;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  showTooltip?: boolean;
  overlayContent?: ReactNode;
  displayOverlayContent?: boolean;
  // Virtual pointer position in viewport space (same space
  // getBoundingClientRect() returns) — replaces the original React Bits
  // component's onMouseMove/onMouseEnter/onMouseLeave DOM handlers, since
  // this app has no real mouse-driven interaction anywhere. Driven by the
  // tracked right index fingertip instead (see ImageGallery). null means
  // "not pointing at anything right now".
  pointerScreenPos: ScreenPos;
};

export function TiltedCard({
  imageSrc,
  altText = 'Tilted card image',
  captionText = '',
  containerHeight = '300px',
  containerWidth = '100%',
  imageHeight = '300px',
  imageWidth = '300px',
  scaleOnHover = 1.1,
  rotateAmplitude = 14,
  showTooltip = true,
  overlayContent = null,
  displayOverlayContent = false,
  pointerScreenPos,
}: TiltedCardProps) {
  const ref = useRef<HTMLElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, enterLeaveSpringValues);
  const opacity = useSpring(0, enterLeaveSpringValues);
  const rotateFigcaption = useSpring(0, {
    stiffness: 350,
    damping: 30,
    mass: 1,
  });
  // Cards sit edge-to-edge in the row; a large scaleOnHover would
  // otherwise get visually clipped under its still-flat neighbors, so
  // lift the hovered card above them for as long as it's scaled up.
  const zIndex = useTransform(scale, (value) => (value > 1.001 ? 1 : 0));

  const lastOffsetYRef = useRef(0);
  const isEnteredRef = useRef(false);

  // Runs whenever a new pointer position arrives (i.e. on every tracking
  // update), taking the place of the original's per-DOM-event handlers.
  // "Entered"/"left" is now just whether the caller gave us a position at
  // all — ImageGallery already decides *which* card is hovered (per its
  // own X-based rule) and only ever passes a non-null position to that
  // one, so re-deriving containment from this card's own rect here would
  // be redundant and, worse, could disagree with the caller right at the
  // rect's edge.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (pointerScreenPos) {
      const rect = node.getBoundingClientRect();
      if (!isEnteredRef.current) {
        isEnteredRef.current = true;
        scale.set(scaleOnHover);
        opacity.set(1);
      }

      const offsetX = pointerScreenPos.x - rect.left - rect.width / 2;
      const offsetY = pointerScreenPos.y - rect.top - rect.height / 2;

      const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
      const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

      rotateX.set(rotationX);
      rotateY.set(rotationY);

      x.set(pointerScreenPos.x - rect.left);
      y.set(pointerScreenPos.y - rect.top);

      const velocityY = offsetY - lastOffsetYRef.current;
      rotateFigcaption.set(-velocityY * 0.6);
      lastOffsetYRef.current = offsetY;
    } else if (isEnteredRef.current) {
      isEnteredRef.current = false;
      opacity.set(0);
      scale.set(1);
      rotateX.set(0);
      rotateY.set(0);
      rotateFigcaption.set(0);
    }
  }, [pointerScreenPos, rotateAmplitude, scaleOnHover, opacity, scale, rotateX, rotateY, rotateFigcaption, x, y]);

  return (
    <motion.figure
      ref={ref}
      className="tilted-card-figure"
      style={{ height: containerHeight, width: containerWidth, zIndex }}
    >
      <motion.div
        className="tilted-card-inner"
        style={{ width: imageWidth, height: imageHeight, rotateX, rotateY, scale }}
      >
        <motion.img
          src={imageSrc}
          alt={altText}
          className="tilted-card-img"
          style={{ width: imageWidth, height: imageHeight }}
        />

        {displayOverlayContent && overlayContent && (
          <motion.div className="tilted-card-overlay">{overlayContent}</motion.div>
        )}
      </motion.div>

      {showTooltip && (
        <motion.figcaption className="tilted-card-caption" style={{ x, y, opacity, rotate: rotateFigcaption }}>
          {captionText}
        </motion.figcaption>
      )}
    </motion.figure>
  );
}
