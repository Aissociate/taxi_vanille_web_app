import { useState, Component, type ReactNode } from 'react';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
import { Sidebar, type Page } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { PlanningPage } from './pages/PlanningPage';
import { ChauffeursPage } from './pages/ChauffeursPage';
import { ClientsPage } from './pages/ClientsPage';
import { FacturationPage } from './pages/FacturationPage';
import { FacturationLignePage } from './pages/FacturationLignePage';
import { LogsPage } from './pages/LogsPage';
import { EntreprisePage } from './pages/settings/EntreprisePage';
import { ParamChauffeursPage } from './pages/settings/ParamChauffeursPage';
import { AlertesPage } from './pages/settings/AlertesPage';
import { IAPromptsPage } from './pages/settings/IAPromptsPage';
import { LignesPage } from './pages/settings/LignesPage';
import { TarifsPage } from './pages/settings/TarifsPage';
import { PlanningSettingsPage } from './pages/settings/PlanningSettingsPage';
import { UsersPage } from './pages/settings/UsersPage';
import { CarteGPSPage } from './pages/CarteGPSPage';
import { DeveloppementPage } from './pages/DeveloppementPage';
import { DebugAIPage } from './pages/DebugAIPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { TimerPage } from './pages/TimerPage';
import { BugReportButton } from './components/BugReportButton';
import MobileApp from './mobile/MobileApp';
import TimerApp from './timer/TimerApp';

// Detection de la plateforme native SANS importer @capacitor/core (sinon le
// build web/admin exigerait ce paquet natif, absent de l'environnement Bolt).
// Le runtime Capacitor injecte window.Capacitor dans la WebView de l'APK ;
// en navigateur classique, il est absent -> false.
function isNativePlatform(): boolean {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center shadow-lg">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl font-bold">!</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Erreur de chargement</h2>
            <p className="text-sm text-gray-500 mb-4">{this.state.error || 'Une erreur inattendue est survenue.'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  // Dans l'app native (APK chauffeur), on demarre toujours en mode mobile,
  // quel que soit le chemin initial de la WebView. En navigateur, on garde la
  // detection par URL (/mobile) pour le tableau de bord directeur.
  // App "Timer" (2e PWA, /timer) : totalement independante de l'app chauffeur.
  if (window.location.pathname.startsWith('/timer')) {
    return <TimerApp />;
  }
  if (isNativePlatform() || window.location.pathname.startsWith('/mobile')) {
    return <MobileApp />;
  }
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-amber-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 font-medium animate-pulse-soft">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={signIn} onSignUp={signUp} />;
  }

  function renderPage() {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'planning': return <PlanningPage user={user!} />;
      case 'carte-gps': return <CarteGPSPage />;
      case 'chauffeurs': return <ChauffeursPage user={user!} onNavigateToPage={(page) => setCurrentPage(page as Page)} />;
      case 'clients': return <ClientsPage user={user!} />;
      case 'incidents': return <IncidentsPage user={user!} />;
      case 'facturation': return <FacturationPage user={user!} />;
      case 'stats-ligne': return <FacturationLignePage user={user!} />;
      case 'timer': return <TimerPage user={user!} />;
      case 'logs': return <LogsPage user={user!} />;
      case 'param-entreprise': return <EntreprisePage user={user!} />;
      case 'param-chauffeurs': return <ParamChauffeursPage />;
      case 'param-alertes': return <AlertesPage user={user!} />;
      case 'param-ia': return <IAPromptsPage user={user!} />;
      case 'param-lignes': return <LignesPage user={user!} />;
      case 'param-planning': return <PlanningSettingsPage user={user!} />;
      case 'param-tarifs': return <TarifsPage user={user!} />;
      case 'param-users': return <UsersPage user={user!} />;
      case 'developpement': return <DeveloppementPage user={user!} />;
      case 'debug-ai': return <DebugAIPage />;
      default: return <DashboardPage />;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/80">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onSignOut={signOut} />
      <main className="ml-64 p-6 lg:p-8 min-h-screen">
        <div className="animate-fade-in">
          {renderPage()}
        </div>
      </main>
      <BugReportButton user={user} />
    </div>
  );
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
