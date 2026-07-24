import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCamera, useCameraPresentation } from '../context/CameraContext';
import { HelpModal } from '../components/HelpModal';
import './Dashboard.css';

function Dashboard() {
  const { isReady, error } = useCamera();
  useCameraPresentation('blurred');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <div className="dashboard">
      {error && <div className="dashboard-fallback-bg" />}
      <div className="dashboard-scrim" />

      <button className="help-button" type="button" aria-label="Help" onClick={() => setIsHelpOpen(true)}>
        ?
      </button>

      <div className="dashboard-content">
        <h1 className="dashboard-title">Hand Tracking VFX</h1>
        <div className="dashboard-buttons">
          <Link className="tool-button" to="/hand-vfx">
            Hand VFX Lens
          </Link>
          <Link className="tool-button" to="/tool-2">
            Tool 2
          </Link>
        </div>
        {error && <p className="dashboard-status dashboard-status-error">Camera error: {error}</p>}
        {!isReady && !error && <p className="dashboard-status">Requesting camera access…</p>}
      </div>

      {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
}

export default Dashboard;
