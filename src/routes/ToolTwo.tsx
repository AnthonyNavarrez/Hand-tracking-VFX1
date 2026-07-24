import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useLeftIndexExtended } from '../tracking/gestures';
import { ImageGallery } from '../components/ImageGallery';
import '../App.css';

function ToolTwo() {
  const { isReady, error } = useCamera();
  const { result: handResult, isModelReady } = useTracking();
  const leftIndexExtended = useLeftIndexExtended(handResult);

  return (
    <div className="app">
      {/* Mounted only while the gate is up, so selection state (added in
          a later phase) always starts fresh on each reveal instead of
          needing a separate reset path. */}
      <div className="stage">{isReady && leftIndexExtended && <ImageGallery />}</div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
      {isReady && !isModelReady && <div className="status">Loading hand tracking model…</div>}
    </div>
  );
}

export default ToolTwo;
