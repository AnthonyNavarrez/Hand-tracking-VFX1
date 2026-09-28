import { Outlet } from 'react-router-dom';
import { TrackingProvider } from '../context/TrackingContext';
import { BackButton } from '../components/BackButton';

// Mounts TrackingProvider only for the tool routes (not the dashboard),
// so the hand-landmark model loads/tears down on entering/leaving the
// tool section as a whole, and stays loaded when switching directly
// between /hand-vfx and /image-fx. BackButton lives here too so both tool
// routes get it without either one needing its own copy.
function ToolLayout() {
  return (
    <TrackingProvider>
      <Outlet />
      <BackButton />
    </TrackingProvider>
  );
}

export default ToolLayout;
