import { createContext, useContext, type ReactNode } from 'react';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { useCamera } from './CameraContext';
import { useHandLandmarker } from '../hooks/useHandLandmarker';

interface TrackingContextValue {
  result: HandLandmarkerResult | null;
  isModelReady: boolean;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

// Mounted only by ToolLayout (wrapping the tool routes), not the
// dashboard, so the model loads/detection loop runs only while a tool is
// actually active and fully tears down when navigating back to "/".
export function TrackingProvider({ children }: { children: ReactNode }) {
  const { videoRef, isReady } = useCamera();
  const { result, isModelReady } = useHandLandmarker(videoRef, isReady);

  return <TrackingContext.Provider value={{ result, isModelReady }}>{children}</TrackingContext.Provider>;
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider');
  return ctx;
}
