import { useState, useEffect } from 'react';
import MobileLoginPage from './pages/MobileLoginPage';
import MobilePlanningPage from './pages/MobilePlanningPage';
import MobileCourseDetailPage from './pages/MobileCourseDetailPage';
import MobileCoordinatorPage from './pages/MobileCoordinatorPage';
import { initOfflineSync } from './lib/offlineQueue';

export default function MobileApp() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    initOfflineSync();
  }, []);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (newPath: string) => {
    window.history.pushState({}, '', newPath);
    setPath(newPath);
  };

  const courseMatch = path.match(/^\/mobile\/course\/(.+)$/);

  if (courseMatch) {
    return <MobileCourseDetailPage courseId={courseMatch[1]} onNavigate={navigate} />;
  }

  switch (path) {
    case '/mobile/planning':
      return <MobilePlanningPage onNavigate={navigate} />;
    case '/mobile/coordinator':
      return <MobileCoordinatorPage onNavigate={navigate} />;
    default:
      return <MobileLoginPage onNavigate={navigate} />;
  }
}
