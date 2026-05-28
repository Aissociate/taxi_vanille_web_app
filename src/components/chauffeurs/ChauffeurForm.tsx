import { useState } from 'react';
import { X } from 'lucide-react';
import type { Chauffeur } from '../../pages/ChauffeursPage';

interface ChauffeurFormProps {
  chauffeur: Chauffeur | null;
  lignes: Array<{ id: string; nom: string }>;
  onSave: (data: Partial<Chauffeur>) => void;
  onClose: () => void;
}

export function ChauffeurForm({ chauffeur, lignes, onSave, onClose }: ChauffeurFormProps) {
  const [form, setForm] = useState({
    code: chauffeur?.code || '',
    nom: chauffeur?.nom || '',
    prenom: chauffeur?.prenom || '',
    telephone: chauffeur?.telephone || '',
    telephone2: chauffeur?.telephone2 || '',
    email: chauffeur?.email || '',
    adresse: chauffeur?.adresse || '',
    carte_identite_numero: chauffeur?.carte_identite_numero || '',
    carte_sejour_numero: chauffeur?.carte_sejour_numero || '',
    facturation_type: chauffeur?.facturation_type || 'hebdomadaire',
    nif_siret: chauffeur?.nif_siret || '',
    licence_transport: chauffeur?.licence_transport || '',
    carte_conducteur_numero: chauffeur?.carte_conducteur_numero || '',
    carte_conducteur_validite: chauffeur?.carte_conducteur_validite || '',
    vehicule_immatriculation: chauffeur?.vehicule_immatriculation || '',
    vehicule_marque: chauffeur?.vehicule_marque || '',
    vehicule_places: chauffeur?.vehicule_places || 0,
    vehicule_date_1ere_immat: chauffeur?.vehicule_date_1ere_immat || '',
    vehicule_carburant: chauffeur?.vehicule_carburant || '',
    vehicule_date_controle_technique: chauffeur?.vehicule_date_controle_technique || '',
    vehicule_assureur: chauffeur?.vehicule_assureur || '',
    numero_permis: chauffeur?.numero_permis || '',
    n_adherent: chauffeur?.n_adherent || '',
    secteur_activite: chauffeur?.secteur_activite || '',
    date_embauche: chauffeur?.date_embauche || new Date().toISOString().split('T')[0],
    ligne_id: chauffeur?.ligne_id || '',
    pin: '',
    statut: chauffeur?.statut || 'actif',
    notes: chauffeur?.notes || '',
    commentaires: chauffeur?.commentaires || '',
    is_coordinateur: chauffeur?.is_coordinateur || false,
    pin_android: chauffeur?.pin_android || '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Partial<Chauffeur> = {
      ...form,
      ligne_id: form.ligne_id || null,
      vehicule_places: form.vehicule_places || 0,
      pin_android: form.is_coordinateur ? (form.pin_android || null) : null,
    };
    if (!form.pin && chauffeur) {
      delete (payload as Record<string, unknown>).pin;
    }
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {chauffeur ? `Modifier · ${chauffeur.code}` : 'Nouveau chauffeur'}
            </p>
            <h2 className="text-lg font-bold text-gray-900 mt-0.5">
              {chauffeur ? `${chauffeur.nom} ${chauffeur.prenom}` : 'Creer un chauffeur'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nom complet *</label>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Code (D1)"
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
              />
              <input
                type="text"
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                placeholder="Prenom"
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
              />
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder="Nom"
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Telephone 1</label>
              <input type="text" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="06 00 00 00 00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Telephone 2</label>
              <input type="text" value={form.telephone2} onChange={(e) => setForm({ ...form, telephone2: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="06 00 00 00 00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="chauffeur@email.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Facturation</label>
              <select value={form.facturation_type} onChange={(e) => setForm({ ...form, facturation_type: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none">
                <option value="trajet">Par trajet</option>
                <option value="journee">Par journee</option>
                <option value="hebdomadaire">Hebdomadaire</option>
                <option value="mensuelle">Mensuelle</option>
                <option value="bi-mensuelle">Bi-mensuelle</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Adresse</label>
            <input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Rue de la paix, Mamoudzou" />
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Identite</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">N Carte d'identite</label>
                <input type="text" value={form.carte_identite_numero} onChange={(e) => setForm({ ...form, carte_identite_numero: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="0123456789" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">N Carte de sejour</label>
                <input type="text" value={form.carte_sejour_numero} onChange={(e) => setForm({ ...form, carte_sejour_numero: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="FRXXXXXXXXXX" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">NIF / SIRET</label>
              <input type="text" value={form.nif_siret} onChange={(e) => setForm({ ...form, nif_siret: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="054 393 749 000 19" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Licence transport</label>
              <input type="text" value={form.licence_transport} onChange={(e) => setForm({ ...form, licence_transport: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="976-PT-026" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Carte conducteur N</label>
              <input type="text" value={form.carte_conducteur_numero} onChange={(e) => setForm({ ...form, carte_conducteur_numero: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="127" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Validite carte</label>
              <input type="date" value={form.carte_conducteur_validite} onChange={(e) => setForm({ ...form, carte_conducteur_validite: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">N adherent</label>
              <input type="text" value={form.n_adherent} onChange={(e) => setForm({ ...form, n_adherent: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="54" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Secteur activite</label>
              <input type="text" value={form.secteur_activite} onChange={(e) => setForm({ ...form, secteur_activite: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Petite Terre" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Vehicule</label>
            <div className="grid grid-cols-3 gap-3">
              <input type="text" value={form.vehicule_immatriculation} onChange={(e) => setForm({ ...form, vehicule_immatriculation: e.target.value })} placeholder="Immatriculation" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              <input type="text" value={form.vehicule_marque} onChange={(e) => setForm({ ...form, vehicule_marque: e.target.value })} placeholder="Marque / Modele" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              <input type="number" value={form.vehicule_places || ''} onChange={(e) => setForm({ ...form, vehicule_places: parseInt(e.target.value) || 0 })} placeholder="Places" className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date 1ere immatriculation</label>
                <input type="date" value={form.vehicule_date_1ere_immat} onChange={(e) => setForm({ ...form, vehicule_date_1ere_immat: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Carburant</label>
                <select value={form.vehicule_carburant} onChange={(e) => setForm({ ...form, vehicule_carburant: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none">
                  <option value="">--</option>
                  <option value="essence">Essence</option>
                  <option value="diesel">Diesel</option>
                  <option value="electrique">Electrique</option>
                  <option value="hybride">Hybride</option>
                  <option value="gpl">GPL</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date dernier CT</label>
                <input type="date" value={form.vehicule_date_controle_technique} onChange={(e) => setForm({ ...form, vehicule_date_controle_technique: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Assureur</label>
                <input type="text" value={form.vehicule_assureur} onChange={(e) => setForm({ ...form, vehicule_assureur: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Nom de l'assurance" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ligne affectee</label>
              <select value={form.ligne_id} onChange={(e) => setForm({ ...form, ligne_id: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none">
                <option value="">-- Aucune --</option>
                {lignes.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">N permis</label>
              <input type="text" value={form.numero_permis} onChange={(e) => setForm({ ...form, numero_permis: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Coordinateur</label>
            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_coordinateur}
                  onChange={(e) => setForm({ ...form, is_coordinateur: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                <span className="ml-2 text-sm font-medium text-gray-700">Est coordinateur</span>
              </label>
            </div>
            {form.is_coordinateur && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PIN Android (acces app mobile)</label>
                <input type="text" value={form.pin_android} onChange={(e) => setForm({ ...form, pin_android: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none font-mono tracking-widest" placeholder="0000" maxLength={6} />
                <p className="text-[10px] text-gray-400 mt-1">Code PIN specifique pour l'application Android du coordinateur</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Commentaires</label>
            <input type="text" value={form.commentaires} onChange={(e) => setForm({ ...form, commentaires: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Observations, dettes, etc." />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nouveau PIN (laisser vide pour ne pas changer)</label>
            <input type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="****" />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
              Annuler
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors text-sm flex items-center justify-center gap-1">
              Enregistrer →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
