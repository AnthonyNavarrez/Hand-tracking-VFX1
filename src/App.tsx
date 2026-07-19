import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { useWebcam } from './hooks/useWebcam';
import { useHandLandmarker } from './hooks/useHandLandmarker';
import { useContainedSize } from './hooks/useContainedSize';
import { DebugOverlay } from './debug/DebugOverlay';
import { LensQuad } from './scene/LensQuad';
import { getCorners } from './tracking/corners';
import type { Corners } from './tracking/types';
import './App.css';

function App() {
  const { videoRef, isReady, error, videoSize } = useWebcam();
  const handResult = useHandLandmarker(videoRef, isReady);

  const aspectRatio = videoSize ? videoSize.width / videoSize.height : null;
  const stageSize = useContainedSize(aspectRatio);
  const corners = getCorners(handResult, stageSize.width, stageSize.height);

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

  // Phase 4: a fixed rectangle to de-risk the shader before wiring it to
  // tracked hands in Phase 5.
  const staticCorners: Corners = [
    { x: stageSize.width * 0.25, y: stageSize.height * 0.75 },
    { x: stageSize.width * 0.25, y: stageSize.height * 0.25 },
    { x: stageSize.width * 0.75, y: stageSize.height * 0.25 },
    { x: stageSize.width * 0.75, y: stageSize.height * 0.75 },
  ];

  return (
    <div className="app">
      <div className="stage" style={{ width: stageSize.width, height: stageSize.height }}>
        <video ref={videoRef} className="webcam-video" autoPlay muted playsInline />
        {videoTexture && (
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
            <LensQuad corners={staticCorners} videoTexture={videoTexture} />
          </Canvas>
        )}
        {isReady && <DebugOverlay videoRef={videoRef} result={handResult} corners={corners} />}
      </div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
    </div>
  );
}

export default App;
