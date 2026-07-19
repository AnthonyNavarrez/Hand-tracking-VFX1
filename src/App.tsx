import { useWebcam } from './hooks/useWebcam';
import './App.css';

function App() {
  const { videoRef, isReady, error } = useWebcam();

  return (
    <div className="app">
      <video ref={videoRef} className="webcam-video" autoPlay muted playsInline />
      {error && <div className="status status-error">Camera error: {error}</div>}
      {!isReady && !error && <div className="status">Requesting camera access…</div>}
    </div>
  );
}

export default App;
