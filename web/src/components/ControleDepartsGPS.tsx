// Demarrages de trajet loin du point de depart (ticket du 17/09/2026 : "des
// chauffeurs demarrent le trajet alors qu'ils ne sont pas sur place ; peut-il
// y avoir un controle a moins de 3 km ?").
//
// Le controle est fait apres coup, cote back office, a partir des positions que
// l'appli chauffeur envoie deja (fonction SQL controle_depart_gps) : rien ne
// change pour les chauffeurs et aucun trajet n'est bloque a 5 h du matin par un
// GPS capricieux. Le blocage dans l'appli reste possible une fois le controle
// eprouve.

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtHM, mDateStr } from '../lib/mayotte';
import { downloadSpreadsheet, type CellValue } from '../lib/spreadsheetExport';

interface Ligne { id: string; code: string }
interface Chauffeur { id: string; code: string; nom: string; prenom: string }

interface Controle {
  course_id: string;
  chauffeur_id: string | null;
  ligne_id: string | null;
  date_heure: string;
  heure_debut: string;
  depart: string | null;
  arrivee: string | null;
  arret_reference: string | null;
  arret_reconnu: boolean;
  distance_km: number;
  ecart_position_min: number;
  latitude: number;
  longitude: number;
}

interface Props {
  debut: Date;
  fin: Date;
  ligneId: string;            // 'all' ou id
  lignes: Ligne[];
  chauffeurs: Chauffeur[];
  libelle: string;
}

const SEUILS = [1, 2, 3, 5];

export function ControleDepartsGPS({ debut, fin, ligneId, lignes, chauffeurs, libelle }: Props) {
  const [seuil, setSeuil] = useState(3);
  const [lignesCtrl, setLignesCtrl] = useState<Controle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      setLoading(true);
      setErreur('');
      const { data, error } = await supabase.rpc('controle_depart_gps', {
        p_debut: debut.toISOString(),
        p_fin: fin.toISOString(),
        p_ligne_id: ligneId === 'all' ? null : ligneId,
      });
      if (annule) return;
      if (error) { setErreur(error.message); setLignesCtrl([]); setTotal(0); }
      else {
        const rows = ((data || []) as Controle[]).map(r => ({ ...r, distance_km: Number(r.distance_km), ecart_position_min: Number(r.ecart_position_min) }));
        setTotal(rows.length);
        // Seuls les demarrages au-dela d'1 km sont gardes en memoire.
        setLignesCtrl(rows.filter(r => r.distance_km > 1));
      }
      setLoading(false);
    })();
    return () => { annule = true; };
  }, [debut, fin, ligneId]);

  const suspects = useMemo(() => lignesCtrl.filter(r => r.distance_km > seuil), [lignesCtrl, seuil]);
  const parChauffeur = useMemo(() => {
    const m = new Map<string, number>();
    suspects.forEach(r => m.set(r.chauffeur_id || '', (m.get(r.chauffeur_id || '') || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [suspects]);

  const nomChauffeur = (id: string | null) => {
    const c = chauffeurs.find(x => x.id === id);
    return c ? `${c.code} ${c.nom} ${c.prenom}`.trim() : 'Chauffeur inconnu';
  };
  const codeLigne = (id: string | null) => lignes.find(l => l.id === id)?.code || '';

  function exporter() {
    const rows: CellValue[][] = [[
      'Date', 'Heure prevue', 'Demarre a', 'Chauffeur', 'Ligne', 'Trajet', 'Arret de reference',
      'Distance (km)', 'Position relevee (min d ecart)', 'Carte',
    ]];
    suspects.forEach(r => rows.push([
      mDateStr(r.date_heure), fmtHM(r.date_heure), fmtHM(r.heure_debut), nomChauffeur(r.chauffeur_id),
      codeLigne(r.ligne_id), `${r.depart || ''} -> ${r.arrivee || ''}`,
      `${r.arret_reference || ''}${r.arret_reconnu ? '' : ' (arret le plus proche)'}`,
      r.distance_km, r.ecart_position_min, `https://maps.google.com/?q=${r.latitude},${r.longitude}`,
    ]));
    downloadSpreadsheet(`Demarrages_hors_zone_${libelle.replace(/[^\w-]+/g, '_')}`, [{ name: 'Demarrages', rows }]);
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="section-label flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Demarrages loin du point de depart</h3>
          <p className="text-xs text-gray-500 mt-1">
            Position GPS de l'appli au moment ou le chauffeur demarre le trajet, comparee a l'arret de depart.
            {total > 0 && ` ${total} demarrages controles sur la periode.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">Au-dela de</span>
          <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5">
            {SEUILS.map(s => (
              <button key={s} type="button" onClick={() => setSeuil(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md ${seuil === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {s} km
              </button>
            ))}
          </div>
          <button type="button" onClick={exporter} disabled={suspects.length === 0} className="btn-secondary !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-4">Controle en cours...</p>
      ) : erreur ? (
        <p className="text-sm text-red-600 py-4">Controle indisponible : {erreur}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mt-4">
            <span className={`text-3xl font-black tracking-tight ${suspects.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{suspects.length}</span>
            <span className="text-xs text-gray-500">demarrage(s) a plus de {seuil} km de l'arret de depart</span>
          </div>
          {parChauffeur.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {parChauffeur.map(([id, n]) => (
                <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                  {nomChauffeur(id)} : <b>{n}</b>
                </span>
              ))}
            </div>
          )}
          {suspects.length > 0 && (
            <button type="button" onClick={() => setOuvert(!ouvert)} className="mt-3 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1">
              {ouvert ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {ouvert ? 'Masquer le detail' : 'Voir le detail'}
            </button>
          )}
          {ouvert && suspects.length > 0 && (
            <div className="mt-3 border border-gray-100 rounded-lg overflow-x-auto max-h-96">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Prevu</th>
                    <th className="px-2 py-2 text-left">Demarre</th>
                    <th className="px-2 py-2 text-left">Chauffeur</th>
                    <th className="px-2 py-2 text-left">Trajet</th>
                    <th className="px-2 py-2 text-left">Arret de reference</th>
                    <th className="px-2 py-2 text-right">Distance</th>
                    <th className="px-2 py-2 text-left">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {suspects.map(r => (
                    <tr key={r.course_id + r.heure_debut}>
                      <td className="px-2 py-1.5 text-gray-600">{mDateStr(r.date_heure).split('-').reverse().slice(0, 2).join('/')}</td>
                      <td className="px-2 py-1.5 font-mono">{fmtHM(r.date_heure)}</td>
                      <td className="px-2 py-1.5 font-mono">{fmtHM(r.heure_debut)}</td>
                      <td className="px-2 py-1.5 text-gray-800">{nomChauffeur(r.chauffeur_id)}</td>
                      <td className="px-2 py-1.5 text-gray-600">{codeLigne(r.ligne_id)} {r.depart} → {r.arrivee}</td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {r.arret_reference}
                        {!r.arret_reconnu && <span className="text-gray-400" title="Le depart saisi ne correspond a aucun arret de la ligne : distance a l'arret le plus proche"> (le plus proche)</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-red-600">{r.distance_km.toLocaleString('fr-FR')} km</td>
                      <td className="px-2 py-1.5">
                        <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">carte</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
