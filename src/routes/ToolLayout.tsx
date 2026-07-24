import { Outlet } from 'react-router-dom';
import { TrackingProvider } from '../context/TrackingContext';

// Mounts TrackingProvider only for the tool routes (not the dashboard),
// so the hand-landmark model loads/tears down on entering/leaving the
// tool section as a whole, and stays loaded when switching directly
// between /hand-vfx and /tool-2.
function ToolLayout() {
  return (
    <TrackingProvider>
      <Outlet />
    </TrackingProvider>
  );
}

export default ToolLayout;
