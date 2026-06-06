import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
import { Sidebar, type Page } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { PlanningPage } from './pages/PlanningPage';
import { ChauffeursPage } from './pages/ChauffeursPage';
import { ClientsPage } from './pages/ClientsPage';
import { FacturationPage } from './pages/FacturationPage';
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
import { BugReportButton } from './components/BugReportButton';
import MobileApp from './mobile/MobileApp';

function App() {
  if (window.location.pathname.startsWith('/mobile')) {
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
      case 'chauffeurs': return <ChauffeursPage user={user!} />;
      case 'clients': return <ClientsPage user={user!} />;
      case 'incidents': return <IncidentsPage user={user!} />;
      case 'facturation': return <FacturationPage user={user!} />;
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

export default App;
