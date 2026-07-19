import { useEffect, useRef, useState, type RefObject } from 'react';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

const HAND_COLORS = ['#00e5ff', '#ff2fd0'];
const HIGHLIGHT_COLOR = '#ffe600';
const HIGHLIGHTED_LANDMARKS = new Set([4, 8]);

type DebugOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  result: HandLandmarkerResult | null;
};

export function DebugOverlay({ videoRef, result }: DebugOverlayProps) {
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

    if (!visible || !result) return;

    result.landmarks.forEach((landmarks, handIndex) => {
      const color = HAND_COLORS[handIndex % HAND_COLORS.length];
      landmarks.forEach((landmark, landmarkIndex) => {
        const x = (1 - landmark.x) * rect.width;
        const y = landmark.y * rect.height;
        const highlighted = HIGHLIGHTED_LANDMARKS.has(landmarkIndex);

        ctx.beginPath();
        ctx.arc(x, y, highlighted ? 8 : 4, 0, Math.PI * 2);
        ctx.fillStyle = highlighted ? HIGHLIGHT_COLOR : color;
        ctx.fill();
        if (highlighted) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#000';
          ctx.stroke();
        }
      });
    });
  }, [result, visible, videoRef]);

  return <canvas ref={canvasRef} className="debug-overlay" />;
}
