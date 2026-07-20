import { useEffect, useRef, useState, type RefObject } from 'react';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Corners } from '../tracking/types';
import { landmarkToScreen, type Size } from '../tracking/corners';

const HAND_DOT_COLORS = ['rgba(0, 229, 255, 0.5)', 'rgba(255, 47, 208, 0.5)'];
const CORNER_COLORS = ['#ff3b3b', '#3bff6a', '#3b9bff', '#ffae3b']; // LT, LI, RI, RT
const CORNER_LABELS = ['LT', 'LI', 'RI', 'RT'];

type DebugOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  result: HandLandmarkerResult | null;
  corners: Corners | null;
  videoSize: Size | null;
  rightPinkyExtended: boolean;
  leftHandOpen: boolean;
};

export function DebugOverlay({
  videoRef,
  result,
  corners,
  videoSize,
  rightPinkyExtended,
  leftHandOpen,
}: DebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'd') setVisible((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = rect.width * dpr;
    const targetHeight = rect.height * dpr;
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!visible) return;

    if (result && videoSize) {
      const stageSize = { width: rect.width, height: rect.height };
      result.landmarks.forEach((landmarks, handIndex) => {
        ctx.fillStyle = HAND_DOT_COLORS[handIndex % HAND_DOT_COLORS.length];
        landmarks.forEach((landmark) => {
          const { x, y } = landmarkToScreen(landmark, videoSize, stageSize);
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    // Corner outline/dots/labels only make sense while the flat lens is
    // the active mode — hide all of it while the sphere is up, or while
    // the left-hand-open particle field has replaced the quad/sphere
    // fill, so only whichever effect is actually active reads as active.
    if (corners && !rightPinkyExtended && !leftHandOpen) {
      ctx.beginPath();
      corners.forEach((corner, i) => {
        if (i === 0) ctx.moveTo(corner.x, corner.y);
        else ctx.lineTo(corner.x, corner.y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      corners.forEach((corner, i) => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = CORNER_COLORS[i];
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.stroke();

        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText(CORNER_LABELS[i], corner.x, corner.y - 14);
      });
    }

    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = rightPinkyExtended ? '#3bff6a' : 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`PINKY: ${rightPinkyExtended ? 'UP' : 'down'}`, 12, 24);
  }, [result, corners, visible, videoRef, videoSize, rightPinkyExtended, leftHandOpen]);

  return <canvas ref={canvasRef} className="debug-overlay" />;
}
