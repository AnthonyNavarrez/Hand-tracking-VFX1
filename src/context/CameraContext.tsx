import { createContext, useContext, type ReactNode } from 'react';
import { useWebcam } from '../hooks/useWebcam';

interface CameraContextValue {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  error: string | null;
  videoSize: { width: number; height: number } | null;
}

const CameraContext = createContext<CameraContextValue | null>(null);

// Canonical, full-bleed video layer shared by every route. Fixed +
// unscoped so it sits behind whatever route content renders after it in
// the DOM, without any route needing to mount its own <video> tag.
const videoStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transform: 'scaleX(-1)',
  background: '#000',
};

export function CameraProvider({ children }: { children: ReactNode }) {
  const { videoRef, isReady, error, videoSize } = useWebcam();

  return (
    <CameraContext.Provider value={{ videoRef, isReady, error, videoSize }}>
      <video ref={videoRef} autoPlay muted playsInline style={videoStyle} />
      {children}
    </CameraContext.Provider>
  );
}

export function useCamera() {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error('useCamera must be used within a CameraProvider');
  return ctx;
}
