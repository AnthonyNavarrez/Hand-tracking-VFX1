import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import {
  useLeftIndexExtended,
  useLeftMiddleExtended,
  useLeftPinkyExtended,
  useLeftRingExtended,
} from '../tracking/gestures';
import { ImageGallery } from '../components/ImageGallery';
import { DomeGallery } from '../components/DomeGallery';
import { CircularGallery } from '../components/CircularGallery';
import { ScatteredGallery } from '../components/ScatteredGallery';
import { DebugOverlay } from '../debug/DebugOverlay';
import '../App.css';

function ImageFx() {
  const { videoRef, isReady, error, videoSize } = useCamera();
  const { result: handResult, isModelReady } = useTracking();
  const leftIndexExtended = useLeftIndexExtended(handResult);
  const leftMiddleExtended = useLeftMiddleExtended(handResult);
  const leftRingExtended = useLeftRingExtended(handResult);
  const leftPinkyExtended = useLeftPinkyExtended(handResult);

  // Mounted only while its own gate is up, so selection/rotation/scroll/
  // scatter state always starts fresh on each reveal instead of needing
  // a separate reset path. Priority when more than one gate is somehow
  // up at once: pinky > ring > middle > index.
  const activeGallery = !isReady
    ? null
    : leftPinkyExtended
      ? 'scattered'
      : leftRingExtended
        ? 'circular'
        : leftMiddleExtended
          ? 'dome'
          : leftIndexExtended
            ? 'flat'
            : null;

  return (
    <div className="app">
      <div className="stage">
        {activeGallery === 'scattered' && <ScatteredGallery />}
        {activeGallery === 'circular' && <CircularGallery />}
        {activeGallery === 'dome' && <DomeGallery />}
        {activeGallery === 'flat' && <ImageGallery />}
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

export default ImageFx;
