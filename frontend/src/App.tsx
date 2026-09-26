import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "./layouts/MainLayout";
import Studio from "./pages/Studio";
import Library from "./pages/Library";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";

import CloningVoice from "./pages/CloningVoice";
import AutoCaption from "./pages/AutoCaption";
import VideoTranslate from "./pages/VideoTranslate";
import Settings from "./pages/Settings";

import { useAutoCloseOnExit } from "./hooks/useAutoCloseOnExit";

export default function App() {
  useAutoCloseOnExit();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Studio />} />
          <Route path="video-translate" element={<VideoTranslate />} />
          <Route path="library" element={<Library />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="cloning-voice" element={<CloningVoice />} />
          <Route path="autocaption" element={<AutoCaption />} />
          <Route path="caption" element={<AutoCaption />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
