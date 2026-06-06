import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import PlanningPage from './pages/PlanningPage';
import CourseDetailPage from './pages/CourseDetailPage';
import CoordinatorPage from './pages/CoordinatorPage';
import OfflineBanner from './components/OfflineBanner';
import { initOfflineSync } from './lib/offlineQueue';

export default function App() {
  useEffect(() => {
    initOfflineSync();
  }, []);

  return (
    <div id="app-shell">
      <BrowserRouter>
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/course/:courseId" element={<CourseDetailPage />} />
          <Route path="/coordinator" element={<CoordinatorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
