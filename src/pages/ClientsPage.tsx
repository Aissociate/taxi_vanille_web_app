import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UserCircle, Plus, Search, Trash2, X, Phone, Mail, Building, TrendingUp, MapPin, Clock, DollarSign, ArrowLeft, FileText } from 'lucide-react';
import { ReportWizard } from '../components/ReportWizard';
import type { User } from '@supabase/supabase-js';

interface Client {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  adresse: string;
  societe: string;
  notes: string;
  contact1_nom: string;
  contact1_telephone: string;
  contact1_email: string;
  contact1_fonction: string;
  contact2_nom: string;
  contact2_telephone: string;
  contact2_email: string;
  contact2_fonction: string;
  contact3_nom: string;
  contact3_telephone: string;
  contact3_email: string;
  contact3_fonction: string;
}

interface Course {
  id: string;
  client_id: string;
  date_heure: string;
  montant: number;
  statut: string;
  depart: string;
  arrivee: string;
  chauffeur_id: string | null;
  ligne_id: string | null;
  periode: string;
  duree_minutes: number;
}

interface Ligne {
  id: string;
  code: string;
  nom: string;
  depart: string;
  arrivee: string;
  couleur: string;
}

interface ClientsPageProps {
  user: User;
}

type Period = 'jour' | 'semaine' | 'mois';

function getPeriodStart(period: Period): Date {
  const now = new Date();
  if (period === 'jour') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'semaine') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function ClientsPage({ user }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('mois');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showReportWizard, setShowReportWizard] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({
    nom: '', telephone: '', email: '', adresse: '', societe: '', notes: '',
    contact1_nom: '', contact1_telephone: '', contact1_email: '', contact1_fonction: '',
    contact2_nom: '', contact2_telephone: '', contact2_email: '', contact2_fonction: '',
    contact3_nom: '', contact3_telephone: '', contact3_email: '', contact3_fonction: '',
  });

  useEffect(() => { loadClients(); loadCourses(); loadLignes(); }, []);

  async function loadClients() {
    const { data } = await supabase.from('clients').select('*').order('nom');
    if (data) setClients(data);
  }

  async function loadCourses() {
    const { data } = await supabase.from('courses').select('id, client_id, date_heure, montant, statut, depart, arrivee, chauffeur_id, ligne_id, periode, duree_minutes');
    if (data) setCourses(data);
  }

  async function loadLignes() {
    const { data } = await supabase.from('lignes').select('id, code, nom, depart, arrivee, couleur').eq('active', true).order('code');
    if (data) setLignes(data);
  }

  function openCreate() {
    setForm({ nom: '', telephone: '', email: '', adresse: '', societe: '', notes: '',
      contact1_nom: '', contact1_telephone: '', contact1_email: '', contact1_fonction: '',
      contact2_nom: '', contact2_telephone: '', contact2_email: '', contact2_fonction: '',
      contact3_nom: '', contact3_telephone: '', contact3_email: '', contact3_fonction: '',
    });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(c: Client) {
    setForm({
      nom: c.nom, telephone: c.telephone, email: c.email, adresse: c.adresse, societe: c.societe, notes: c.notes,
      contact1_nom: c.contact1_nom || '', contact1_telephone: c.contact1_telephone || '', contact1_email: c.contact1_email || '', contact1_fonction: c.contact1_fonction || '',
      contact2_nom: c.contact2_nom || '', contact2_telephone: c.contact2_telephone || '', contact2_email: c.contact2_email || '', contact2_fonction: c.contact2_fonction || '',
      contact3_nom: c.contact3_nom || '', contact3_telephone: c.contact3_telephone || '', contact3_email: c.contact3_email || '', contact3_fonction: c.contact3_fonction || '',
    });
    setEditing(c);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, user_id: user.id };
    if (editing) {
      await supabase.from('clients').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('clients').insert(payload);
    }
    setShowForm(false);
    loadClients();
    if (selectedClient && editing) {
      setSelectedClient({ ...selectedClient, ...form });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    await supabase.from('clients').delete().eq('id', id);
    if (selectedClient?.id === id) setSelectedClient(null);
    loadClients();
  }

  const filtered = clients.filter((c) =>
    `${c.nom} ${c.telephone} ${c.societe} ${c.contact1_nom} ${c.contact2_nom}`.toLowerCase().includes(search.toLowerCase())
  );

  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  const clientKpis = useMemo(() => {
    if (!selectedClient) return null;
    const clientCourses = courses.filter(
      (c) => c.client_id === selectedClient.id && new Date(c.date_heure) >= periodStart
    );
    const totalCourses = clientCourses.length;
    const totalMontant = clientCourses.reduce((s, c) => s + (c.montant || 0), 0);
    const completedCourses = clientCourses.filter(c => c.statut === 'terminee').length;
    const cancelledCourses = clientCourses.filter(c => c.statut === 'annulee').length;
    return { totalCourses, totalMontant, completedCourses, cancelledCourses };
  }, [selectedClient, courses, periodStart]);

  const globalKpis = useMemo(() => {
    const periodCourses = courses.filter(c => new Date(c.date_heure) >= periodStart);
    const totalCourses = periodCourses.length;
    const totalMontant = periodCourses.reduce((s, c) => s + (c.montant || 0), 0);
    const uniqueClients = new Set(periodCourses.map(c => c.client_id).filter(Boolean)).size;
    return { totalCourses, totalMontant, uniqueClients };
  }, [courses, periodStart]);

  // DETAIL VIEW
  if (selectedClient) {
    const clientCourses = courses
      .filter(c => c.client_id === selectedClient.id && new Date(c.date_heure) >= periodStart)
      .sort((a, b) => new Date(b.date_heure).getTime() - new Date(a.date_heure).getTime());

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedClient(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{selectedClient.nom}</h1>
            <div className="flex items-center gap-4 mt-1">
              {selectedClient.societe && <span className="flex items-center gap-1 text-sm text-gray-500"><Building className="w-3.5 h-3.5" />{selectedClient.societe}</span>}
              {selectedClient.telephone && <span className="flex items-center gap-1 text-sm text-gray-500"><Phone className="w-3.5 h-3.5" />{selectedClient.telephone}</span>}
              {selectedClient.email && <span className="flex items-center gap-1 text-sm text-gray-500"><Mail className="w-3.5 h-3.5" />{selectedClient.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowReportWizard(true)} className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors shadow-sm flex items-center gap-2">
              <FileText className="w-4 h-4" /> Generer un rapport
            </button>
            <button onClick={() => openEdit(selectedClient)} className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm">
              Modifier
            </button>
          </div>
        </div>

        {/* Contacts */}
        {(selectedClient.contact1_nom || selectedClient.contact2_nom || selectedClient.contact3_nom) && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Contacts</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {selectedClient.contact1_nom && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Principal</p>
                  <p className="text-sm font-medium text-gray-900">{selectedClient.contact1_nom}</p>
                  {selectedClient.contact1_fonction && <p className="text-xs text-gray-500">{selectedClient.contact1_fonction}</p>}
                  {selectedClient.contact1_telephone && <p className="text-xs text-gray-600 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedClient.contact1_telephone}</p>}
                  {selectedClient.contact1_email && <p className="text-xs text-gray-600 flex items-center gap-1"><Mail className="w-3 h-3" />{selectedClient.contact1_email}</p>}
                </div>
              )}
              {selectedClient.contact2_nom && (
                <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Secondaire 1</p>
                  <p className="text-sm font-medium text-gray-900">{selectedClient.contact2_nom}</p>
                  {selectedClient.contact2_fonction && <p className="text-xs text-gray-500">{selectedClient.contact2_fonction}</p>}
                  {selectedClient.contact2_telephone && <p className="text-xs text-gray-600 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedClient.contact2_telephone}</p>}
                  {selectedClient.contact2_email && <p className="text-xs text-gray-600 flex items-center gap-1"><Mail className="w-3 h-3" />{selectedClient.contact2_email}</p>}
                </div>
              )}
              {selectedClient.contact3_nom && (
                <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Secondaire 2</p>
                  <p className="text-sm font-medium text-gray-900">{selectedClient.contact3_nom}</p>
                  {selectedClient.contact3_fonction && <p className="text-xs text-gray-500">{selectedClient.contact3_fonction}</p>}
                  {selectedClient.contact3_telephone && <p className="text-xs text-gray-600 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedClient.contact3_telephone}</p>}
                  {selectedClient.contact3_email && <p className="text-xs text-gray-600 flex items-center gap-1"><Mail className="w-3 h-3" />{selectedClient.contact3_email}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Period selector */}
        <div className="flex items-center gap-2">
          {(['jour', 'semaine', 'mois'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {p === 'jour' ? 'Aujourd\'hui' : p === 'semaine' ? 'Cette semaine' : 'Ce mois'}
            </button>
          ))}
        </div>

        {/* KPIs */}
        {clientKpis && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{clientKpis.totalCourses}</p>
                  <p className="text-xs text-gray-500">Courses</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{clientKpis.totalMontant.toFixed(0)} EUR</p>
                  <p className="text-xs text-gray-500">Chiffre d'affaires</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{clientKpis.completedCourses}</p>
                  <p className="text-xs text-gray-500">Terminees</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                  <X className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{clientKpis.cancelledCourses}</p>
                  <p className="text-xs text-gray-500">Annulees</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent courses */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Courses recentes</h3>
          </div>
          {clientCourses.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Aucune course sur cette periode</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {clientCourses.slice(0, 15).map(c => (
                <div key={c.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{c.depart || '?'} → {c.arrivee || '?'}</p>
                    <p className="text-xs text-gray-400">{new Date(c.date_heure).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.statut === 'terminee' ? 'bg-emerald-50 text-emerald-700' : c.statut === 'annulee' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                    {c.statut}
                  </span>
                  <span className="text-sm font-medium text-gray-700">{c.montant?.toFixed(0) || 0} EUR</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit modal */}
        {showForm && renderForm()}

        {/* Report Wizard */}
        {showReportWizard && (
          <ReportWizard
            user={user}
            clientId={selectedClient.id}
            clientNom={selectedClient.nom}
            lignes={lignes}
            courses={courses}
            onClose={() => setShowReportWizard(false)}
            onSaved={() => {}}
          />
        )}
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1">{clients.length} client(s) enregistre(s)</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Period selector + KPIs */}
      <div className="flex items-center gap-2">
        {(['jour', 'semaine', 'mois'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {p === 'jour' ? 'Aujourd\'hui' : p === 'semaine' ? 'Cette semaine' : 'Ce mois'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{globalKpis.totalCourses}</p>
              <p className="text-xs text-gray-500">Total courses</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{globalKpis.totalMontant.toFixed(0)} EUR</p>
              <p className="text-xs text-gray-500">Chiffre d'affaires</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{globalKpis.uniqueClients}</p>
              <p className="text-xs text-gray-500">Clients actifs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <UserCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun client trouve</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => {
            const cCourses = courses.filter(co => co.client_id === c.id && new Date(co.date_heure) >= periodStart);
            const cTotal = cCourses.reduce((s, co) => s + (co.montant || 0), 0);
            return (
              <div
                key={c.id}
                onClick={() => setSelectedClient(c)}
                className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-amber-200 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-emerald-50 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-emerald-600">{c.nom[0]}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{c.nom}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {c.telephone && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{c.telephone}</span>}
                      {c.email && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{c.email}</span>}
                      {c.societe && <span className="flex items-center gap-1 text-xs text-gray-500"><Building className="w-3 h-3" />{c.societe}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{cCourses.length} course{cCourses.length !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-gray-400">{cTotal.toFixed(0)} EUR</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                    className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      {showForm && renderForm()}
    </div>
  );

  function renderForm() {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{editing ? 'Modifier le client' : 'Nouveau client'}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom du client *</label>
              <input type="text" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="ex: CADEMA, Mairie de Mamoudzou..." required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
                <input type="text" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Societe</label>
                <input type="text" value={form.societe} onChange={(e) => setForm({ ...form, societe: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
            </div>

            {/* Contact principal */}
            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-amber-600" />
                Interlocuteur principal
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.contact1_nom} onChange={(e) => setForm({ ...form, contact1_nom: e.target.value })} placeholder="Nom" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="text" value={form.contact1_fonction} onChange={(e) => setForm({ ...form, contact1_fonction: e.target.value })} placeholder="Fonction" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="text" value={form.contact1_telephone} onChange={(e) => setForm({ ...form, contact1_telephone: e.target.value })} placeholder="Telephone" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="email" value={form.contact1_email} onChange={(e) => setForm({ ...form, contact1_email: e.target.value })} placeholder="Email" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
            </div>

            {/* Contact secondaire 1 */}
            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-gray-400" />
                Interlocuteur secondaire 1
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.contact2_nom} onChange={(e) => setForm({ ...form, contact2_nom: e.target.value })} placeholder="Nom" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="text" value={form.contact2_fonction} onChange={(e) => setForm({ ...form, contact2_fonction: e.target.value })} placeholder="Fonction" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="text" value={form.contact2_telephone} onChange={(e) => setForm({ ...form, contact2_telephone: e.target.value })} placeholder="Telephone" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="email" value={form.contact2_email} onChange={(e) => setForm({ ...form, contact2_email: e.target.value })} placeholder="Email" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
            </div>

            {/* Contact secondaire 2 */}
            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-gray-400" />
                Interlocuteur secondaire 2
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.contact3_nom} onChange={(e) => setForm({ ...form, contact3_nom: e.target.value })} placeholder="Nom" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="text" value={form.contact3_fonction} onChange={(e) => setForm({ ...form, contact3_fonction: e.target.value })} placeholder="Fonction" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="text" value={form.contact3_telephone} onChange={(e) => setForm({ ...form, contact3_telephone: e.target.value })} placeholder="Telephone" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
                <input type="email" value={form.contact3_email} onChange={(e) => setForm({ ...form, contact3_email: e.target.value })} placeholder="Email" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">Annuler</button>
              <button type="submit" className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors">{editing ? 'Modifier' : 'Creer'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}
