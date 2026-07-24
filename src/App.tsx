import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CameraProvider } from './context/CameraContext';
import Dashboard from './routes/Dashboard';
import ToolLayout from './routes/ToolLayout';
import HandVfxTool from './routes/HandVfxTool';
import ToolTwo from './routes/ToolTwo';

function App() {
  return (
    <CameraProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route element={<ToolLayout />}>
            <Route path="/hand-vfx" element={<HandVfxTool />} />
            <Route path="/tool-2" element={<ToolTwo />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CameraProvider>
  );
}

export default App;
