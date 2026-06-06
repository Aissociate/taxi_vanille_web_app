import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCircle,
  Receipt,
  ScrollText,
  Settings,
  ChevronDown,
  Car,
  LogOut,
  Building2,
  Bell,
  Brain,
  MapPin,
  Coins,
  Map,
  Code2,
  Bot,
  AlertTriangle,
  KeyRound,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { useState } from 'react';

export type Page =
  | 'dashboard'
  | 'planning'
  | 'carte-gps'
  | 'chauffeurs'
  | 'clients'
  | 'incidents'
  | 'facturation'
  | 'logs'
  | 'param-entreprise'
  | 'param-chauffeurs'
  | 'param-alertes'
  | 'param-ia'
  | 'param-lignes'
  | 'param-planning'
  | 'param-tarifs'
  | 'param-users'
  | 'developpement'
  | 'debug-ai';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onSignOut: () => void;
}

const mainItems = [
  { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'planning' as Page, label: 'Planning', icon: Calendar },
  { id: 'carte-gps' as Page, label: 'Carte GPS', icon: Map },
  { id: 'chauffeurs' as Page, label: 'Chauffeurs', icon: Users },
  { id: 'clients' as Page, label: 'Clients', icon: UserCircle },
  { id: 'incidents' as Page, label: 'Incidents', icon: AlertTriangle },
  { id: 'facturation' as Page, label: 'Facturation', icon: Receipt },
  { id: 'logs' as Page, label: 'Logs', icon: ScrollText },
  { id: 'developpement' as Page, label: 'Developpement', icon: Code2 },
];

const paramItems = [
  { id: 'param-entreprise' as Page, label: 'Entreprise', icon: Building2 },
  { id: 'param-chauffeurs' as Page, label: 'Chauffeurs', icon: Users },
  { id: 'param-planning' as Page, label: 'Planning', icon: Calendar },
  { id: 'param-alertes' as Page, label: 'Alertes', icon: Bell },
  { id: 'param-ia' as Page, label: 'IA & Prompts', icon: Brain },
  { id: 'param-lignes' as Page, label: 'Lignes', icon: MapPin },
  { id: 'param-tarifs' as Page, label: 'Tarifs', icon: Coins },
  { id: 'param-users' as Page, label: 'Utilisateurs', icon: KeyRound },
];

export function Sidebar({ currentPage, onNavigate, onSignOut }: SidebarProps) {
  const [paramOpen, setParamOpen] = useState(currentPage.startsWith('param-'));

  return (
    <aside className="w-64 bg-gray-950 text-white flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-[15px] leading-tight tracking-tight">Taxi Vanille</h1>
            <p className="text-[11px] text-gray-500 font-medium">Gestion de flotte</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-3 space-y-0.5">
        {mainItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-white/[0.1] text-white shadow-nav'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-150 ${isActive ? 'text-amber-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
              {item.label}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}

        {/* Parametrage section */}
        <div className="pt-3 mt-2 border-t border-white/[0.06]">
          <button
            onClick={() => setParamOpen(!paramOpen)}
            className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
              currentPage.startsWith('param-')
                ? 'bg-white/[0.1] text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Settings className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-150 ${currentPage.startsWith('param-') ? 'text-amber-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
            <span className="flex-1 text-left">Parametrage</span>
            <span className={`transition-transform duration-200 ${paramOpen ? 'rotate-0' : '-rotate-90'}`}>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </span>
          </button>

          <div className={`overflow-hidden transition-all duration-200 ${paramOpen ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
            <div className="ml-5 pl-3 border-l border-white/[0.08] space-y-0.5">
              {paramItems.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'text-amber-400 bg-amber-400/[0.08]'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/[0.06] space-y-0.5">
        <a
          href="/mobile/"
          target="_blank"
          rel="noopener noreferrer"
          className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-500 hover:text-amber-400 hover:bg-amber-500/[0.06] transition-all duration-150"
        >
          <Smartphone className="w-[18px] h-[18px]" />
          <span className="flex-1">App Chauffeur</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
        <button
          onClick={() => onNavigate('debug-ai')}
          className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
            currentPage === 'debug-ai'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/[0.06]'
          }`}
        >
          <Bot className="w-[18px] h-[18px]" />
          DebugAI
        </button>
        <button
          onClick={onSignOut}
          className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/[0.06] transition-all duration-150"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Deconnexion
        </button>
      </div>
    </aside>
  );
}
