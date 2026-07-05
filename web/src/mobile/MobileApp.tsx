import { useState, useEffect } from 'react';
import MobileLoginPage from './pages/MobileLoginPage';
import MobilePlanningPage from './pages/MobilePlanningPage';
import MobileCourseDetailPage from './pages/MobileCourseDetailPage';
import MobileCoordinatorPage from './pages/MobileCoordinatorPage';
import { initOfflineSync } from './lib/offlineQueue';
import { useKeepAwake } from './lib/useKeepAwake';

// Rappel non bloquant : localisation et reseau de donnees doivent etre actifs
// pour le suivi des courses. On ne PEUT PAS forcer leur activation (Android
// l'interdit) ; on invite le chauffeur a les activer, et le bandeau disparait
// automatiquement des que c'est bon.
function ReadinessBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [locationOff, setLocationOff] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!('geolocation' in navigator)) { setLocationOff(true); return; }
      navigator.geolocation.getCurrentPosition(
        () => { if (!cancelled) setLocationOff(false); },
        () => { if (!cancelled) setLocationOff(true); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    };
    check();
    const id = setInterval(check, 60000); // re-verifie chaque minute
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (online && !locationOff) return null;

  return (
    <div className="sticky top-0 z-50">
      {locationOff && (
        <div className="bg-red-600 text-white text-center text-xs font-semibold px-3 py-2">
          ⚠ Localisation désactivée — activez le GPS pour le suivi des courses.
        </div>
      )}
      {!online && (
        <div className="bg-yellow-500 text-white text-center text-xs font-semibold px-3 py-2">
          ⚠ Réseau de données coupé — activez les données mobiles ou le Wi-Fi.
        </div>
      )}
    </div>
  );
}

export default function MobileApp() {
  const [path, setPath] = useState(window.location.pathname);

  // Empeche la mise en veille de l'ecran tant que l'app chauffeur/coordinateur est ouverte
  useKeepAwake();

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

  const renderRoute = () => {
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
  };

  return (
    <>
      <ReadinessBanner />
      {renderRoute()}
    </>
  );
}
