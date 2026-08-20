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
    vehicule_type_lien: chauffeur?.vehicule_type_lien || '',
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
    pin_android: '',
  });

  // Les deux champs PIN sont des <input type="password"> : le gestionnaire de
  // mots de passe du navigateur les remplissait TOUS LES DEUX avec le mot de
  // passe enregistre pour le site. Comme "champ non vide = nouveau PIN", la
  // valeur auto-remplie ecrasait silencieusement l'autre PIN (PIN coordinateur
  // repasse a 0000, PIN chauffeur passe a 9999, voire un vrai mot de passe
  // enregistre dans le champ PIN). On exige donc une action explicite : tant
  // que la case n'est pas cochee, le PIN n'est ni saisissable ni envoye.
  const [changePin, setChangePin] = useState(!chauffeur);
  const [changePinAndroid, setChangePinAndroid] = useState(!chauffeur);

  const PIN_RE = /^[0-9]{4}$/; // chauffeur_login() n'accepte que 4 chiffres

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Garde-fou : un PIN non conforme serait accepte par le formulaire mais
    // REFUSE au login (l'appli exige exactement 4 chiffres) -> compte bloque.
    if (changePin && form.pin && !PIN_RE.test(form.pin)) {
      alert('Le PIN chauffeur doit contenir exactement 4 chiffres.');
      return;
    }
    if (form.is_coordinateur && changePinAndroid && form.pin_android && !PIN_RE.test(form.pin_android)) {
      alert('Le PIN coordinateur doit contenir exactement 4 chiffres.');
      return;
    }
    const dateFields = ['carte_conducteur_validite', 'vehicule_date_1ere_immat', 'vehicule_date_controle_technique', 'date_embauche'];
    const payload: Partial<Chauffeur> = {
      ...form,
      ligne_id: form.ligne_id || null,
      vehicule_places: form.vehicule_places || 0,
    };
    for (const field of dateFields) {
      if (!(payload as Record<string, unknown>)[field]) {
        (payload as Record<string, unknown>)[field] = null;
      }
    }
    // PIN chauffeur : envoye UNIQUEMENT si l'utilisateur a demande le changement
    // (sinon on n'inclut pas le champ -> la valeur en base est preservee).
    if (!changePin || !form.pin) {
      if (chauffeur) {
        delete (payload as Record<string, unknown>).pin;
      } else {
        (payload as Record<string, unknown>).pin = '1234';
      }
    }
    // PIN coordinateur : null si le chauffeur n'est pas coordinateur ; sinon meme regle.
    if (!form.is_coordinateur) {
      payload.pin_android = null;
    } else if (!changePinAndroid || !form.pin_android) {
      if (chauffeur) {
        delete (payload as Record<string, unknown>).pin_android;
      } else {
        (payload as Record<string, unknown>).pin_android = '1234';
      }
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
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Lien avec le vehicule</label>
              <select value={form.vehicule_type_lien} onChange={(e) => setForm({ ...form, vehicule_type_lien: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none">
                <option value="">--</option>
                <option value="proprietaire">Proprietaire</option>
                <option value="locataire">Locataire</option>
                <option value="credit_bail">Locataire Credit-Bail</option>
                <option value="loue_tv">Loue a Taxi Vanille</option>
              </select>
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
                {chauffeur && (
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={changePinAndroid}
                      onChange={(e) => { setChangePinAndroid(e.target.checked); if (!e.target.checked) setForm(f => ({ ...f, pin_android: '' })); }}
                      className="w-4 h-4 rounded accent-amber-600"
                    />
                    <span className="text-xs font-medium text-gray-600">Changer le PIN coordinateur</span>
                  </label>
                )}
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PIN coordinateur (4 chiffres)</label>
                <input
                  type="password"
                  name="pin-coordinateur"
                  autoComplete="new-password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  disabled={!changePinAndroid}
                  value={form.pin_android}
                  onChange={(e) => setForm({ ...form, pin_android: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none font-mono tracking-widest disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder={changePinAndroid ? '****' : 'PIN inchange'}
                />
                <p className="text-[10px] text-gray-400 mt-1">Code PIN de connexion en mode COORDINATEUR dans l'appli mobile (convention maison : 9999)</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Commentaires</label>
            <input type="text" value={form.commentaires} onChange={(e) => setForm({ ...form, commentaires: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Observations, dettes, etc." />
          </div>

          <div>
            {chauffeur && (
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={changePin}
                  onChange={(e) => { setChangePin(e.target.checked); if (!e.target.checked) setForm(f => ({ ...f, pin: '' })); }}
                  className="w-4 h-4 rounded accent-amber-600"
                />
                <span className="text-xs font-medium text-gray-600">Changer le PIN chauffeur</span>
              </label>
            )}
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PIN chauffeur (4 chiffres)</label>
            <input
              type="password"
              name="pin-chauffeur"
              autoComplete="new-password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              disabled={!changePin}
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none font-mono tracking-widest disabled:bg-gray-50 disabled:text-gray-400"
              placeholder={changePin ? '****' : 'PIN inchange'}
            />
            <p className="text-[10px] text-gray-400 mt-1">Code PIN de connexion en mode CHAUFFEUR dans l'appli mobile (convention maison : 0000)</p>
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
