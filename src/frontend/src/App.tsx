import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Nav } from "./components";
import { DiffPage, VisualizePage } from "./pages";
import { useTheme } from "./hooks";

function AppShell() {
  useTheme();
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="pt-16">
        <Routes>
          <Route path="/" element={<Navigate to="/diff" replace />} />
          <Route path="/diff" element={<DiffPage />} />
          <Route path="/visualize" element={
            <div className="max-w-5xl mx-auto px-4 pb-8">
              <VisualizePage />
            </div>
          } />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
