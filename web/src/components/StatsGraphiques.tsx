// Graphiques demandes par la CADEMA (ticket du 04/09/2026), affiches sous le
// tableau de bord et suivant sa periode (jour / semaine / mois) et son filtre
// de ligne.
//
//   1. Trajets effectues / non effectues par jour (histogramme empile) + part
//      sur la periode (secteur)
//   2. Ponctualite : part quotidienne d'avances et de retards de plus de
//      10 minutes (histogramme) + repartition sur la periode (secteur)
//   3. Duree moyenne des trajets par jour (courbe)
//   4. Duree moyenne par heure de depart, aller et retour distingues (courbes)
//   5. Usagers par jour, au sens MAX(montees, descentes) (histogramme)
//   6. Taux de frequentation par heure de depart (courbe)
//
// Tout est dessine en SVG, sans librairie de graphiques : le projet evite les
// dependances de rendu (risque de build casse par un re-export Bolt / OTA).

import { useMemo } from 'react';
import { mParts, mDateStr } from '../lib/mayotte';

export interface StatCourse {
  id: string;
  date_heure: string;
  statut_realisation: string | null;
  statut: string | null;
  duree_minutes: number | null;
  ligne_id: string | null;
  depart?: string | null;
  passagers_depart?: number | null;
  passagers_arrivee?: number | null;
}

export interface StatExecution {
  course_id: string;
  heure_debut: string;
  heure_fin: string | null;
}

interface Props {
  courses: StatCourse[];
  executions: StatExecution[];
  lignes: { id: string; nom: string; code?: string; depart?: string | null }[];
  /** Capacite d'un vehicule, chauffeur exclu (9 places -> 8). */
  capacite?: number;
  /** Seuil de retard/avance en minutes (aligne sur le tableau de bord). */
  seuilMinutes?: number;
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const COUL = {
  effectue: '#059669',
  nonEffectue: '#dc2626',
  retard: '#dc2626',
  avance: '#2563eb',
  heure: '#059669',
  aller: '#d97706',
  retour: '#2563eb',
  usagers: '#7c3aed',
  taux: '#0891b2',
};

// ---------------------------------------------------------------- primitives

function Cadre({ titre, sous, children }: { titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{titre}</h3>
      {sous && <p className="text-[11px] text-gray-400 mt-0.5 mb-3">{sous}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Legende({ items }: { items: { couleur: string; libelle: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-2">
      {items.map(i => (
        <span key={i.libelle} className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: i.couleur }} />
          {i.libelle}
        </span>
      ))}
    </div>
  );
}

/** Histogramme empile : chaque barre = une categorie, chaque segment une serie. */
function BarresEmpilees({ data, series, unite }: {
  data: { label: string; valeurs: number[] }[];
  series: { couleur: string; libelle: string }[];
  unite?: string;
}) {
  const H = 160, L = 28, B = 22;
  const max = Math.max(1, ...data.map(d => d.valeurs.reduce((s, v) => s + v, 0)));
  const largeurBarre = 100 / Math.max(1, data.length);
  if (data.length === 0) return <p className="text-xs text-gray-400 py-8 text-center">Aucune donnee sur la periode</p>;
  return (
    <>
      <svg viewBox={`0 0 100 ${H + B}`} preserveAspectRatio="none" className="w-full" style={{ height: H + B }}>
        {[0, 0.5, 1].map(f => (
          <line key={f} x1="0" x2="100" y1={L + (H - L) * (1 - f)} y2={L + (H - L) * (1 - f)} stroke="#f3f4f6" strokeWidth="0.5" />
        ))}
        {data.map((d, i) => {
          let cumul = 0;
          const x = i * largeurBarre + largeurBarre * 0.2;
          const w = largeurBarre * 0.6;
          return (
            <g key={d.label}>
              {d.valeurs.map((v, si) => {
                const h = (v / max) * (H - L);
                const y = L + (H - L) - cumul - h;
                cumul += h;
                return v > 0 ? <rect key={si} x={x} y={y} width={w} height={h} fill={series[si].couleur} rx="0.4" /> : null;
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex" style={{ marginTop: -18 }}>
        {data.map(d => (
          <div key={d.label} className="text-center text-[9px] text-gray-500" style={{ width: `${largeurBarre}%` }}>
            <span className="block font-semibold text-gray-700">{d.valeurs.reduce((s, v) => s + v, 0) || ''}</span>
            {d.label}
          </div>
        ))}
      </div>
      <Legende items={series.map(s => ({ couleur: s.couleur, libelle: s.libelle + (unite || '') }))} />
    </>
  );
}

/** Camembert simple (parts d'un total). */
function Secteurs({ parts }: { parts: { valeur: number; couleur: string; libelle: string }[] }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  if (total === 0) return <p className="text-xs text-gray-400 py-8 text-center">Aucune donnee sur la periode</p>;
  let angle = -Math.PI / 2;
  const R = 42, C = 50;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-32 h-32 flex-shrink-0">
        {parts.map(p => {
          if (p.valeur === 0) return null;
          const a = (p.valeur / total) * Math.PI * 2;
          const x1 = C + R * Math.cos(angle), y1 = C + R * Math.sin(angle);
          angle += a;
          const x2 = C + R * Math.cos(angle), y2 = C + R * Math.sin(angle);
          const grand = a > Math.PI ? 1 : 0;
          // Un seul segment a 100 % : le path d'arc degenere, on trace un disque.
          if (p.valeur === total) return <circle key={p.libelle} cx={C} cy={C} r={R} fill={p.couleur} />;
          return <path key={p.libelle} d={`M${C},${C} L${x1},${y1} A${R},${R} 0 ${grand},1 ${x2},${y2} Z`} fill={p.couleur} />;
        })}
      </svg>
      <div className="space-y-1">
        {parts.map(p => (
          <div key={p.libelle} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.couleur }} />
            <span className="text-gray-600">{p.libelle}</span>
            <span className="font-semibold text-gray-900">{p.valeur}</span>
            <span className="text-gray-400">({total > 0 ? Math.round((p.valeur / total) * 100) : 0} %)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Une ou plusieurs courbes sur le meme axe. */
function Courbes({ labels, series, unite }: {
  labels: string[];
  series: { couleur: string; libelle: string; valeurs: (number | null)[] }[];
  unite?: string;
}) {
  const H = 150, L = 20;
  const toutes = series.flatMap(s => s.valeurs.filter((v): v is number => v !== null));
  if (labels.length === 0 || toutes.length === 0) {
    return <p className="text-xs text-gray-400 py-8 text-center">Aucune donnee sur la periode</p>;
  }
  const max = Math.max(...toutes) * 1.1 || 1;
  const pas = 100 / Math.max(1, labels.length - 1 || 1);
  const y = (v: number) => L + (H - L) * (1 - v / max);
  return (
    <>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }}>
        {[0, 0.5, 1].map(f => (
          <line key={f} x1="0" x2="100" y1={L + (H - L) * (1 - f)} y2={L + (H - L) * (1 - f)} stroke="#f3f4f6" strokeWidth="0.5" />
        ))}
        {series.map(s => {
          const pts = s.valeurs
            .map((v, i) => (v === null ? null : `${i * pas},${y(v)}`))
            .filter((p): p is string => p !== null);
          if (pts.length === 0) return null;
          return (
            <g key={s.libelle}>
              <polyline points={pts.join(' ')} fill="none" stroke={s.couleur} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              {s.valeurs.map((v, i) => (v === null ? null : (
                <circle key={i} cx={i * pas} cy={y(v)} r="1.2" fill={s.couleur} />
              )))}
            </g>
          );
        })}
        <text x="0.5" y={L - 6} fontSize="6" fill="#9ca3af">{Math.round(max)}{unite || ''}</text>
      </svg>
      <div className="flex justify-between text-[9px] text-gray-500 mt-1">
        {labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
      </div>
      {series.length > 1 && <Legende items={series.map(s => ({ couleur: s.couleur, libelle: s.libelle }))} />}
    </>
  );
}

// ------------------------------------------------------------------ composant

export function StatsGraphiques({ courses, executions, lignes, capacite = 8, seuilMinutes = 10 }: Props) {
  const execByCourse = useMemo(() => {
    const m = new Map<string, StatExecution>();
    executions.forEach(e => { if (!m.has(e.course_id)) m.set(e.course_id, e); });
    return m;
  }, [executions]);

  const estEffectue = (c: StatCourse) => (c.statut_realisation || c.statut) === 'termine'
    || (c.statut_realisation || c.statut) === 'terminee';
  // Non effectue = annule / incident / repris par un remplacant, ou passe sans
  // avoir jamais ete termine (memes regles que le planning et les stats ligne).
  const estNonEffectue = (c: StatCourse) => {
    const st = c.statut_realisation || c.statut || '';
    if (['annule', 'annulee', 'incident', 'non_effectue', 'remplace'].includes(st)) return true;
    return new Date(c.date_heure).getTime() < Date.now() && !estEffectue(c);
  };

  // 1 - effectues / non effectues par jour de la semaine
  const parJourSemaine = useMemo(() => {
    const acc = JOURS.map(j => ({ label: j, valeurs: [0, 0] }));
    courses.forEach(c => {
      const p = mParts(c.date_heure);
      const idx = (p.dow + 6) % 7;                       // dimanche = 0 -> 6
      if (estEffectue(c)) acc[idx].valeurs[0] += 1;
      else if (estNonEffectue(c)) acc[idx].valeurs[1] += 1;
    });
    return acc;
  }, [courses]);

  const totalEffectues = parJourSemaine.reduce((s, d) => s + d.valeurs[0], 0);
  const totalNonEffectues = parJourSemaine.reduce((s, d) => s + d.valeurs[1], 0);

  // 2 - ponctualite : avance / a l'heure / retard, par jour et sur la periode
  const ecartDepart = (c: StatCourse): number | null => {
    const e = execByCourse.get(c.id);
    if (!e?.heure_debut) return null;
    return (new Date(e.heure_debut).getTime() - new Date(c.date_heure).getTime()) / 60000;
  };

  const ponctualiteParJour = useMemo(() => {
    const parDate = new Map<string, { retard: number; avance: number; heure: number }>();
    courses.forEach(c => {
      const ec = ecartDepart(c);
      if (ec === null) return;
      const j = mDateStr(c.date_heure);
      const a = parDate.get(j) || { retard: 0, avance: 0, heure: 0 };
      if (ec > seuilMinutes) a.retard += 1;
      else if (ec < -seuilMinutes) a.avance += 1;
      else a.heure += 1;
      parDate.set(j, a);
    });
    return [...parDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jour, a]) => ({ label: jour.slice(8), valeurs: [a.heure, a.avance, a.retard] }));
  }, [courses, execByCourse, seuilMinutes]);

  const totauxPonctualite = ponctualiteParJour.reduce(
    (s, d) => [s[0] + d.valeurs[0], s[1] + d.valeurs[1], s[2] + d.valeurs[2]],
    [0, 0, 0],
  );

  // 3 - duree moyenne reelle par jour
  const dureeParJour = useMemo(() => {
    const parDate = new Map<string, { total: number; nb: number }>();
    courses.forEach(c => {
      const e = execByCourse.get(c.id);
      if (!e?.heure_fin) return;
      const min = (new Date(e.heure_fin).getTime() - new Date(e.heure_debut).getTime()) / 60000;
      if (min <= 0 || min > 24 * 60) return;             // execution aberrante
      const j = mDateStr(c.date_heure);
      const a = parDate.get(j) || { total: 0, nb: 0 };
      a.total += min; a.nb += 1;
      parDate.set(j, a);
    });
    return [...parDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jour, a]) => ({ jour, moyenne: a.total / a.nb }));
  }, [courses, execByCourse]);

  // 4 - duree moyenne par heure de depart, aller / retour
  const sensDe = (c: StatCourse): 'aller' | 'retour' | null => {
    const ligne = lignes.find(l => l.id === c.ligne_id);
    if (!ligne?.depart || !c.depart) return null;
    return c.depart.trim().toLowerCase() === ligne.depart.trim().toLowerCase() ? 'aller' : 'retour';
  };

  const heures = useMemo(() => {
    const set = new Set<number>();
    courses.forEach(c => set.add(mParts(c.date_heure).h));
    return [...set].sort((a, b) => a - b);
  }, [courses]);

  const dureeParHeure = useMemo(() => {
    const acc = new Map<string, { total: number; nb: number }>();
    courses.forEach(c => {
      const e = execByCourse.get(c.id);
      if (!e?.heure_fin) return;
      const min = (new Date(e.heure_fin).getTime() - new Date(e.heure_debut).getTime()) / 60000;
      if (min <= 0 || min > 24 * 60) return;
      const sens = sensDe(c) || 'aller';
      const cle = `${sens}|${mParts(c.date_heure).h}`;
      const a = acc.get(cle) || { total: 0, nb: 0 };
      a.total += min; a.nb += 1;
      acc.set(cle, a);
    });
    const serie = (sens: string) => heures.map(h => {
      const a = acc.get(`${sens}|${h}`);
      return a ? Math.round((a.total / a.nb) * 10) / 10 : null;
    });
    return { aller: serie('aller'), retour: serie('retour') };
  }, [courses, execByCourse, heures, lignes]);

  // 5 - usagers par jour = MAX(montees, descentes), regle de la direction
  const usagersCourse = (c: StatCourse) => Math.max(c.passagers_depart || 0, c.passagers_arrivee || 0);

  const usagersParJour = useMemo(() => {
    const parDate = new Map<string, number>();
    courses.filter(estEffectue).forEach(c => {
      const j = mDateStr(c.date_heure);
      parDate.set(j, (parDate.get(j) || 0) + usagersCourse(c));
    });
    return [...parDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jour, v]) => ({ label: jour.slice(8), valeurs: [v] }));
  }, [courses]);

  // 6 - taux de frequentation par heure de depart
  const tauxParHeure = useMemo(() => {
    const acc = new Map<number, { usagers: number; trajets: number }>();
    courses.filter(estEffectue).forEach(c => {
      const h = mParts(c.date_heure).h;
      const a = acc.get(h) || { usagers: 0, trajets: 0 };
      a.usagers += usagersCourse(c); a.trajets += 1;
      acc.set(h, a);
    });
    return heures.map(h => {
      const a = acc.get(h);
      return a && a.trajets > 0 ? Math.round((a.usagers / (a.trajets * capacite)) * 1000) / 10 : null;
    });
  }, [courses, heures, capacite]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Statistiques CADEMA</h2>
        <p className="text-[11px] text-gray-400">
          Sur la periode et la ligne selectionnees en haut de page. Les durees et les heures reelles
          proviennent de l'appli chauffeur ; un trajet jamais demarre n'y figure pas.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Cadre titre="Trajets effectues / non effectues" sous="Par jour de la semaine, sur la periode">
          <BarresEmpilees
            data={parJourSemaine}
            series={[{ couleur: COUL.effectue, libelle: 'Effectues' }, { couleur: COUL.nonEffectue, libelle: 'Non effectues' }]}
          />
        </Cadre>

        <Cadre titre="Part des trajets effectues" sous="Ensemble de la periode">
          <Secteurs parts={[
            { valeur: totalEffectues, couleur: COUL.effectue, libelle: 'Effectues' },
            { valeur: totalNonEffectues, couleur: COUL.nonEffectue, libelle: 'Non effectues' },
          ]} />
        </Cadre>

        <Cadre titre={`Ponctualite au depart (seuil ${seuilMinutes} min)`} sous="Par jour : a l'heure, en avance, en retard">
          <BarresEmpilees
            data={ponctualiteParJour}
            series={[
              { couleur: COUL.heure, libelle: "A l'heure" },
              { couleur: COUL.avance, libelle: 'En avance' },
              { couleur: COUL.retard, libelle: 'En retard' },
            ]}
          />
        </Cadre>

        <Cadre titre="Repartition de la ponctualite" sous="Ensemble de la periode">
          <Secteurs parts={[
            { valeur: totauxPonctualite[0], couleur: COUL.heure, libelle: "A l'heure" },
            { valeur: totauxPonctualite[1], couleur: COUL.avance, libelle: `En avance de plus de ${seuilMinutes} min` },
            { valeur: totauxPonctualite[2], couleur: COUL.retard, libelle: `En retard de plus de ${seuilMinutes} min` },
          ]} />
        </Cadre>

        <Cadre titre="Duree moyenne des trajets" sous="Par jour, en minutes">
          <Courbes
            labels={dureeParJour.map(d => d.jour.slice(8))}
            series={[{ couleur: COUL.aller, libelle: 'Duree moyenne', valeurs: dureeParJour.map(d => Math.round(d.moyenne * 10) / 10) }]}
            unite=" min"
          />
        </Cadre>

        <Cadre titre="Duree moyenne par heure de depart" sous="Aller et retour distingues, en minutes">
          <Courbes
            labels={heures.map(h => `${String(h).padStart(2, '0')}h`)}
            series={[
              { couleur: COUL.aller, libelle: 'Aller', valeurs: dureeParHeure.aller },
              { couleur: COUL.retour, libelle: 'Retour', valeurs: dureeParHeure.retour },
            ]}
            unite=" min"
          />
        </Cadre>

        <Cadre titre="Usagers par jour" sous="Maximum entre les montees et les descentes">
          <BarresEmpilees
            data={usagersParJour}
            series={[{ couleur: COUL.usagers, libelle: 'Usagers' }]}
          />
        </Cadre>

        <Cadre titre="Taux de frequentation par heure de depart" sous={`Usagers rapportes a ${capacite} places par trajet, en %`}>
          <Courbes
            labels={heures.map(h => `${String(h).padStart(2, '0')}h`)}
            series={[{ couleur: COUL.taux, libelle: 'Taux', valeurs: tauxParHeure }]}
            unite=" %"
          />
        </Cadre>
      </div>
    </div>
  );
}
