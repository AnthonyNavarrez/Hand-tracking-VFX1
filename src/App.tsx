import { useWebcam } from './hooks/useWebcam';
import { useHandLandmarker } from './hooks/useHandLandmarker';
import { useContainedSize } from './hooks/useContainedSize';
import { DebugOverlay } from './debug/DebugOverlay';
import { getCorners } from './tracking/corners';
import './App.css';

function App() {
  const { videoRef, isReady, error, videoSize } = useWebcam();
  const handResult = useHandLandmarker(videoRef, isReady);

  const aspectRatio = videoSize ? videoSize.width / videoSize.height : null;
  const stageSize = useContainedSize(aspectRatio);
  const corners = getCorners(handResult, stageSize.width, stageSize.height);

  return (
    <div className="app">
      <div className="stage" style={{ width: stageSize.width, height: stageSize.height }}>
        <video ref={videoRef} className="webcam-video" autoPlay muted playsInline />
        {isReady && <DebugOverlay videoRef={videoRef} result={handResult} corners={corners} />}
      </div>
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
    </div>
  );
}

export default App;
