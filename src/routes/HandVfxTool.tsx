import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { useWebcam } from '../hooks/useWebcam';
import { useHandLandmarker } from '../hooks/useHandLandmarker';
import { useWindowSize } from '../hooks/useWindowSize';
import { DebugOverlay } from '../debug/DebugOverlay';
import { LensQuad } from '../scene/LensQuad';
import { LensSphere } from '../scene/LensSphere';
import { SphereModeMix } from '../scene/SphereModeMix';
import { HandOpenMix } from '../scene/HandOpenMix';
import { ParticleField } from '../scene/ParticleField';
import { getCorners, landmarkToScreen } from '../tracking/corners';
import {
  getLeftHandKeyPoints,
  getLeftHandPinkyAngle,
  getLeftHandWrist,
  getRightHandIndexTip,
  useLeftHandOpen,
  useLeftPinkyExtended,
  useRightHandOpen,
  useRightIndexExtended,
  useRightMiddleExtended,
  useRightPinkyExtended,
} from '../tracking/gestures';
import '../App.css';

function HandVfxTool() {
  const { videoRef, isReady, error, videoSize } = useWebcam();
  const handResult = useHandLandmarker(videoRef, isReady);

  const stageSize = useWindowSize();
  const corners = getCorners(handResult, videoSize, stageSize);
  const rightPinkyExtended = useRightPinkyExtended(handResult);
  const rightHandOpen = useRightHandOpen(handResult);
  const rightIndexExtended = useRightIndexExtended(handResult);
  const rightMiddleExtended = useRightMiddleExtended(handResult);
  const leftPinkyExtended = useLeftPinkyExtended(handResult);
  const leftHandOpen = useLeftHandOpen(handResult);
  const leftHandAngle = getLeftHandPinkyAngle(handResult);
  const leftHandWristLandmark = getLeftHandWrist(handResult);
  const leftHandScreenPos =
    leftHandWristLandmark && videoSize ? landmarkToScreen(leftHandWristLandmark, videoSize, stageSize) : null;
  const leftHandKeyPointLandmarks = getLeftHandKeyPoints(handResult);
  const leftHandRepelPoints =
    leftHandKeyPointLandmarks && videoSize
      ? leftHandKeyPointLandmarks.map((landmark) => landmarkToScreen(landmark, videoSize, stageSize))
      : null;
  const rightHandIndexTipLandmark = getRightHandIndexTip(handResult);
  const rightHandScreenPos =
    rightHandIndexTipLandmark && videoSize
      ? landmarkToScreen(rightHandIndexTipLandmark, videoSize, stageSize)
      : null;
  const sphereModeMixRef = useRef(0);
  const handOpenMixRef = useRef(0);

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
            // far is generous (well beyond 1000) because the sphere can
            // now grow to the screen diagonal (open-hand full-screen
            // gesture), and its geometry extends +/-radius in world Z —
            // easily 2000+ on a large screen, which would otherwise get
            // clipped by the far plane.
            camera={{ position: [0, 0, 10], near: 0.1, far: 100000 }}
            gl={{ alpha: true }}
          >
            <SphereModeMix rightPinkyExtended={rightPinkyExtended} mixRef={sphereModeMixRef} />
            <HandOpenMix leftHandOpen={leftHandOpen} mixRef={handOpenMixRef} />
            {hasTrackedOnce && (
              <LensQuad
                targetCorners={corners}
                videoTexture={videoTexture}
                videoSize={videoSize}
                rightPinkyExtended={rightPinkyExtended}
                handOpenMixRef={handOpenMixRef}
              />
            )}
            <LensSphere
              targetCorners={corners}
              videoTexture={videoTexture}
              videoSize={videoSize}
              rightHandOpen={rightHandOpen}
              leftPinkyExtended={leftPinkyExtended}
              leftHandOpen={leftHandOpen}
              leftHandAngle={leftHandAngle}
              sphereModeMixRef={sphereModeMixRef}
              handOpenMixRef={handOpenMixRef}
            />
            <ParticleField
              isSphereActive={rightPinkyExtended}
              leftHandScreenPos={leftHandScreenPos}
              leftHandRepelPoints={leftHandRepelPoints}
              rightHandOpen={rightHandOpen}
              rightHandScreenPos={rightHandScreenPos}
              rightIndexExtended={rightIndexExtended}
              rightMiddleExtended={rightMiddleExtended}
              videoTexture={videoTexture}
              videoSize={videoSize}
              handOpenMixRef={handOpenMixRef}
            />
          </Canvas>
        )}
        {isReady && (
          <DebugOverlay
            videoRef={videoRef}
            result={handResult}
            corners={corners}
            videoSize={videoSize}
            rightPinkyExtended={rightPinkyExtended}
            leftHandOpen={leftHandOpen}
          />
        )}
      </div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
    </div>
  );
}

export default HandVfxTool;
