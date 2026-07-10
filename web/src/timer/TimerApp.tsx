import { useState, useEffect } from 'react';
import TimerLoginPage from './pages/TimerLoginPage';
import TimerPlanningPage from './pages/TimerPlanningPage';
import TimerCoursePage from './pages/TimerCoursePage';
import { initTimerSync } from './lib/timerSync';
import { useKeepAwake } from '../mobile/lib/useKeepAwake';

// App "Taxi Vanille Timer" : 2e PWA (route /timer), session + file d'attente
// isolees. N'ecrit QUE dans timer_segments. Aucune interaction avec l'app
// chauffeur ni le planning/facturation.
export default function TimerApp() {
  const [path, setPath] = useState(window.location.pathname);
  useKeepAwake();

  useEffect(() => { initTimerSync(); }, []);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (newPath: string) => {
    window.history.pushState({}, '', newPath);
    setPath(newPath);
  };

  const courseMatch = path.match(/^\/timer\/course\/(.+)$/);
  if (courseMatch) return <TimerCoursePage courseId={courseMatch[1]} onNavigate={navigate} />;
  if (path === '/timer/planning') return <TimerPlanningPage onNavigate={navigate} />;
  return <TimerLoginPage onNavigate={navigate} />;
}
