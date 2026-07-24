import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import './TiltedCard.css';

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2,
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
  const scale = useSpring(1, springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, {
    stiffness: 350,
    damping: 30,
    mass: 1,
  });

  const lastOffsetYRef = useRef(0);
  const isEnteredRef = useRef(false);

  // Runs whenever a new pointer position arrives (i.e. on every tracking
  // update), taking the place of the original's per-DOM-event handlers.
  // "Entered"/"left" is now decided here, from rect containment, instead
  // of the browser's own mouseenter/mouseleave.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const inside =
      !!pointerScreenPos &&
      pointerScreenPos.x >= rect.left &&
      pointerScreenPos.x <= rect.right &&
      pointerScreenPos.y >= rect.top &&
      pointerScreenPos.y <= rect.bottom;

    if (inside && pointerScreenPos) {
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
    <figure ref={ref} className="tilted-card-figure" style={{ height: containerHeight, width: containerWidth }}>
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
    </figure>
  );
}
