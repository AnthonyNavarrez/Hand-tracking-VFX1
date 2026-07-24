import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { ImageGallery } from '../components/ImageGallery';
import '../App.css';

function ToolTwo() {
  const { isReady, error } = useCamera();
  const { isModelReady } = useTracking();

  return (
    <div className="app">
      <div className="stage">{isReady && <ImageGallery />}</div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
      {isReady && !isModelReady && <div className="status">Loading hand tracking model…</div>}
    </div>
  );
}

export default ToolTwo;
