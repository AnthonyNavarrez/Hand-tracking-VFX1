import { Link } from 'react-router-dom';

// Temporary placeholder for Phase D0 — proves routing/navigation works.
// Real dashboard (blurred camera background, styled buttons, help modal)
// comes in later phases (D2, D4, D5).
function Dashboard() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#fff', background: '#000', minHeight: '100vh' }}>
      <h1>Dashboard (placeholder)</h1>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link to="/hand-vfx">Hand VFX Lens</Link>
        <Link to="/tool-2">Tool 2</Link>
      </nav>
    </div>
  );
}

export default Dashboard;
