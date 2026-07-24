import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useWebcam } from '../hooks/useWebcam';

type Presentation = 'plain' | 'blurred';

interface CameraContextValue {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  error: string | null;
  videoSize: { width: number; height: number } | null;
  setPresentation: (presentation: Presentation) => void;
}

const CameraContext = createContext<CameraContextValue | null>(null);

// Canonical, full-bleed video layer shared by every route. Fixed +
// unscoped so it sits behind whatever route content renders after it in
// the DOM, without any route needing to mount its own <video> tag.
// Routes toggle `presentation` (plain vs. blurred) rather than each
// mounting their own <video> with their own filter.
const baseVideoStyle: React.CSSProperties = {
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
  const [presentation, setPresentation] = useState<Presentation>('plain');

  const videoStyle: React.CSSProperties = {
    ...baseVideoStyle,
    filter: presentation === 'blurred' ? 'blur(32px) brightness(0.6) saturate(1.1)' : 'none',
    // Blur reads the source video a bit past the viewport edge so the
    // blurred edges never show an un-blurred sliver of frame.
    transform: presentation === 'blurred' ? 'scaleX(-1) scale(1.1)' : 'scaleX(-1)',
  };

  return (
    <CameraContext.Provider value={{ videoRef, isReady, error, videoSize, setPresentation }}>
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

// Lets a route declare how the shared video should be presented while it's
// mounted. Resets to 'plain' on unmount so leaving the dashboard never
// leaves the tool routes blurred.
export function useCameraPresentation(presentation: Presentation) {
  const { setPresentation } = useCamera();
  useEffect(() => {
    setPresentation(presentation);
    return () => setPresentation('plain');
  }, [presentation, setPresentation]);
}
