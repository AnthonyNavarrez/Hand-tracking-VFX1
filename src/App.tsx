import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './routes/Dashboard';
import HandVfxTool from './routes/HandVfxTool';
import ToolTwoStub from './routes/ToolTwoStub';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/hand-vfx" element={<HandVfxTool />} />
        <Route path="/tool-2" element={<ToolTwoStub />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
