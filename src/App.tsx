import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { useWebcam } from './hooks/useWebcam';
import { useHandLandmarker } from './hooks/useHandLandmarker';
import { useWindowSize } from './hooks/useWindowSize';
import { DebugOverlay } from './debug/DebugOverlay';
import { LensQuad } from './scene/LensQuad';
import { getCorners } from './tracking/corners';
import './App.css';

function App() {
  const { videoRef, isReady, error, videoSize } = useWebcam();
  const handResult = useHandLandmarker(videoRef, isReady);

  const stageSize = useWindowSize();
  const corners = getCorners(handResult, videoSize, stageSize);

  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (!isReady || !videoRef.current) return;
    const texture = new THREE.VideoTexture(videoRef.current);
    setVideoTexture(texture);
    return () => {
      texture.dispose();
      setVideoTexture(null);
    };
  }, [isReady, videoRef]);

  // Once corners have been seen at least once, keep LensQuad mounted for
  // the rest of the session — it fades itself out via its own opacity
  // uniform when hands leave, rather than mounting/unmounting (which would
  // pop instead of fade, and churn geometry/material needlessly).
  const [hasTrackedOnce, setHasTrackedOnce] = useState(false);
  useEffect(() => {
    if (corners) setHasTrackedOnce(true);
  }, [corners]);

  return (
    <div className="app">
      <div className="stage">
        <video ref={videoRef} className="webcam-video" autoPlay muted playsInline />
        {videoTexture && videoSize && (
          <Canvas
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            orthographic
            // Frustum (left/right/top/bottom) is owned and kept in sync by
            // LensQuad via useThree(), since r3f's built-in "manual
            // frustum via this prop" path only calls
            // updateProjectionMatrix() once and goes stale on resize.
            camera={{ position: [0, 0, 10], near: 0.1, far: 1000 }}
            gl={{ alpha: true }}
          >
            {hasTrackedOnce && (
              <LensQuad targetCorners={corners} videoTexture={videoTexture} videoSize={videoSize} />
            )}
          </Canvas>
        )}
        {isReady && (
          <DebugOverlay videoRef={videoRef} result={handResult} corners={corners} videoSize={videoSize} />
        )}
      </div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
    </div>
  );
}

export default App;
