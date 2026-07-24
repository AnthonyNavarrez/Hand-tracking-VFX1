import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useLeftIndexExtended } from '../tracking/gestures';
import { ImageGallery } from '../components/ImageGallery';
import { DebugOverlay } from '../debug/DebugOverlay';
import '../App.css';

function ToolTwo() {
  const { videoRef, isReady, error, videoSize } = useCamera();
  const { result: handResult, isModelReady } = useTracking();
  const leftIndexExtended = useLeftIndexExtended(handResult);

  return (
    <div className="app">
      {/* Mounted only while the gate is up, so selection state (added in
          a later phase) always starts fresh on each reveal instead of
          needing a separate reset path. */}
      <div className="stage">
        {isReady && leftIndexExtended && <ImageGallery />}
        {/* Reused as-is (per plan) — corners/rightPinkyExtended/leftHandOpen
            don't apply here, so passed as null/false/false; this just
            surfaces the tracked hand landmark dots for this route. */}
        {isReady && (
          <DebugOverlay
            videoRef={videoRef}
            result={handResult}
            corners={null}
            videoSize={videoSize}
            rightPinkyExtended={false}
            leftHandOpen={false}
          />
        )}
      </div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
      {isReady && !isModelReady && <div className="status">Loading hand tracking model…</div>}
    </div>
  );
}

export default ToolTwo;
