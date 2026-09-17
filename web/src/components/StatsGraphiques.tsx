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
//
// 17/09/2026 :
//   - chaque graphique a une vraie echelle a gauche (l'etiquette etait etiree
//     par le SVG deforme et illisible) ;
//   - chaque graphique se copie en image (a coller dans Word ou Excel) ou se
//     telecharge en PNG, et toutes les donnees sortent dans un fichier Excel ;
//   - l'histogramme 1 suit la periode : par jour de la semaine en vue Semaine,
//     par date en vue Mois (en vue Mois, "Lun" cumulait 4 ou 5 lundis).

import { useMemo, useRef, useState } from 'react';
import { Copy, Download, Check, FileSpreadsheet } from 'lucide-react';
import { mParts, mDateStr } from '../lib/mayotte';
import { etatTrajet } from '../lib/statutCourse';
import { dureeExecution, dureeValide, DUREE_MAX_VALIDE, type ExecutionTrajet } from '../lib/dashboardData';
import { downloadSpreadsheet, type CellValue } from '../lib/spreadsheetExport';

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

interface Props {
  courses: StatCourse[];
  executions: ExecutionTrajet[];
  lignes: { id: string; nom: string; code?: string; depart?: string | null }[];
  /** Trajets retires des statistiques dans "Stats par ligne". */
  exclus?: Set<string>;
  /** 'mois' : l'histogramme 1 est par date plutot que par jour de semaine. */
  periode?: 'jour' | 'semaine' | 'mois';
  /** Libelle de la periode et de la ligne, repris dans les exports. */
  libelle?: string;
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

// Dimensions du dessin : un repere fixe (sans deformation), mis a l'echelle
// par le navigateur. Les textes restent donc lisibles, a l'ecran comme dans
// l'image copiee.
const W = 640, H = 240;
const MARGE = { g: 44, d: 10, h: 26, b: 34 };
const POLICE = 'Inter, system-ui, sans-serif';

// ---------------------------------------------------------------- primitives

/** Graduation "ronde" : 0, pas, 2 pas... jusqu'a couvrir le maximum. */
function graduations(max: number): number[] {
  if (max <= 0) return [0, 1];
  const brut = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= brut) || brut;
  const out: number[] = [];
  for (let v = 0; v < max + pas * 0.001; v += pas) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(Math.round((out[out.length - 1] + pas) * 100) / 100);
  return out;
}

function Axes({ ticks, unite, etiquettes }: { ticks: number[]; unite?: string; etiquettes: { x: number; texte: string; sous?: string }[] }) {
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => MARGE.h + (H - MARGE.h - MARGE.b) * (1 - v / top);
  return (
    <g fontFamily={POLICE}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={MARGE.g} x2={W - MARGE.d} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#d1d5db' : '#f3f4f6'} strokeWidth="1" />
          <text x={MARGE.g - 6} y={y(t) + 3.5} fontSize="10" fill="#6b7280" textAnchor="end">{t.toLocaleString('fr-FR')}</text>
        </g>
      ))}
      {unite && <text x={4} y={12} fontSize="10" fill="#9ca3af">{unite}</text>}
      {etiquettes.map((e, i) => (
        <g key={i}>
          <text x={e.x} y={H - MARGE.b + 14} fontSize="10" fill="#6b7280" textAnchor="middle">{e.texte}</text>
          {e.sous && <text x={e.x} y={H - MARGE.b + 26} fontSize="9" fill="#9ca3af" textAnchor="middle">{e.sous}</text>}
        </g>
      ))}
    </g>
  );
}

function Legende({ items }: { items: { couleur: string; libelle: string }[] }) {
  let x = MARGE.g;
  return (
    <g fontFamily={POLICE}>
      {items.map(i => {
        const x0 = x;
        x += 22 + i.libelle.length * 6;
        return (
          <g key={i.libelle}>
            <rect x={x0} y={4} width="9" height="9" rx="2" fill={i.couleur} />
            <text x={x0 + 13} y={12} fontSize="10" fill="#4b5563">{i.libelle}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Histogramme empile : chaque barre = une categorie, chaque segment une serie. */
function BarresEmpilees({ data, series, unite }: {
  data: { label: string; sous?: string; valeurs: number[] }[];
  series: { couleur: string; libelle: string }[];
  unite?: string;
}) {
  if (data.length === 0) return <Vide />;
  const ticks = graduations(Math.max(1, ...data.map(d => d.valeurs.reduce((s, v) => s + v, 0))));
  const top = ticks[ticks.length - 1];
  const zone = H - MARGE.h - MARGE.b;
  const larg = (W - MARGE.g - MARGE.d) / data.length;
  const pasEtiquette = Math.ceil(data.length / 16);
  return (
    <>
      <Axes
        ticks={ticks}
        unite={unite}
        etiquettes={data.map((d, i) => ({ x: MARGE.g + larg * (i + 0.5), texte: i % pasEtiquette === 0 ? d.label : '', sous: i % pasEtiquette === 0 ? d.sous : undefined }))}
      />
      {data.map((d, i) => {
        let cumul = 0;
        const x = MARGE.g + larg * i + larg * 0.18;
        const w = larg * 0.64;
        const total = d.valeurs.reduce((s, v) => s + v, 0);
        return (
          <g key={`${d.label}-${i}`}>
            {d.valeurs.map((v, si) => {
              const h = (v / top) * zone;
              const yy = MARGE.h + zone - cumul - h;
              cumul += h;
              return v > 0 ? <rect key={si} x={x} y={yy} width={w} height={h} fill={series[si].couleur} rx="1.5" /> : null;
            })}
            {total > 0 && data.length <= 31 && (
              <text x={x + w / 2} y={MARGE.h + zone - cumul - 3} fontSize="9" fill="#374151" textAnchor="middle" fontFamily={POLICE} fontWeight="600">{total}</text>
            )}
          </g>
        );
      })}
      {series.length > 1 && <Legende items={series} />}
    </>
  );
}

/** Une ou plusieurs courbes sur le meme axe. */
function Courbes({ labels, series, unite }: {
  labels: string[];
  series: { couleur: string; libelle: string; valeurs: (number | null)[] }[];
  unite?: string;
}) {
  const toutes = series.flatMap(s => s.valeurs.filter((v): v is number => v !== null));
  if (labels.length === 0 || toutes.length === 0) return <Vide />;
  const ticks = graduations(Math.max(...toutes));
  const top = ticks[ticks.length - 1];
  const zone = H - MARGE.h - MARGE.b;
  const larg = W - MARGE.g - MARGE.d;
  const x = (i: number) => MARGE.g + (labels.length > 1 ? (i / (labels.length - 1)) * larg : larg / 2);
  const y = (v: number) => MARGE.h + zone * (1 - v / top);
  const pasEtiquette = Math.ceil(labels.length / 16);
  return (
    <>
      <Axes ticks={ticks} unite={unite} etiquettes={labels.map((l, i) => ({ x: x(i), texte: i % pasEtiquette === 0 ? l : '' }))} />
      {series.map(s => {
        const pts = s.valeurs.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter((p): p is string => p !== null);
        if (pts.length === 0) return null;
        return (
          <g key={s.libelle}>
            <polyline points={pts.join(' ')} fill="none" stroke={s.couleur} strokeWidth="2" strokeLinejoin="round" />
            {s.valeurs.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2.8" fill="white" stroke={s.couleur} strokeWidth="1.5" />))}
          </g>
        );
      })}
      {series.length > 1 && <Legende items={series} />}
    </>
  );
}

/** Camembert simple (parts d'un total), legende dessinee dans le SVG. */
function Secteurs({ parts }: { parts: { valeur: number; couleur: string; libelle: string }[] }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  if (total === 0) return <Vide />;
  let angle = -Math.PI / 2;
  const R = 90, CX = 120, CY = H / 2;
  return (
    <g fontFamily={POLICE}>
      {parts.map(p => {
        if (p.valeur === 0) return null;
        const a = (p.valeur / total) * Math.PI * 2;
        const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
        angle += a;
        const x2 = CX + R * Math.cos(angle), y2 = CY + R * Math.sin(angle);
        // Un seul segment a 100 % : le path d'arc degenere, on trace un disque.
        if (p.valeur === total) return <circle key={p.libelle} cx={CX} cy={CY} r={R} fill={p.couleur} />;
        return <path key={p.libelle} d={`M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${a > Math.PI ? 1 : 0},1 ${x2},${y2} Z`} fill={p.couleur} />;
      })}
      {parts.map((p, i) => (
        <g key={p.libelle} transform={`translate(250, ${CY - parts.length * 14 + i * 28 + 8})`}>
          <rect width="12" height="12" rx="2" fill={p.couleur} />
          <text x="20" y="10" fontSize="13" fill="#4b5563">{p.libelle}</text>
          <text x="20" y="10" dx={p.libelle.length * 7 + 8} fontSize="13" fill="#111827" fontWeight="700">
            {p.valeur.toLocaleString('fr-FR')}
            <tspan fill="#9ca3af" fontWeight="400"> ({Math.round((p.valeur / total) * 100)} %)</tspan>
          </text>
        </g>
      ))}
    </g>
  );
}

function Vide() {
  return <text x={W / 2} y={H / 2} fontSize="12" fill="#9ca3af" textAnchor="middle" fontFamily={POLICE}>Aucune donnee sur la periode</text>;
}

// ------------------------------------------------------- copie / telechargement

/** Rend le SVG d'un graphique en PNG (fond blanc, titre inclus). */
async function svgEnPng(svg: SVGSVGElement, titre: string): Promise<Blob> {
  const echelle = 2;
  const entete = 30;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));
  const src = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('image')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = W * echelle;
    canvas.height = (H + entete) * echelle;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(echelle, echelle);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H + entete);
    ctx.fillStyle = '#111827';
    ctx.font = `600 14px ${POLICE}`;
    ctx.fillText(titre, 8, 20);
    ctx.drawImage(img, 0, entete, W, H);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('png'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Cadre({ titre, sous, libelle, children }: { titre: string; sous?: string; libelle?: string; children: React.ReactNode }) {
  const ref = useRef<SVGSVGElement>(null);
  const [etat, setEtat] = useState<'' | 'copie' | 'erreur'>('');
  const titreComplet = libelle ? `${titre} — ${libelle}` : titre;

  async function copier() {
    if (!ref.current) return;
    try {
      const blob = await svgEnPng(ref.current, titreComplet);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setEtat('copie');
    } catch {
      setEtat('erreur');
    }
    setTimeout(() => setEtat(''), 2500);
  }

  async function telecharger() {
    if (!ref.current) return;
    const blob = await svgEnPng(ref.current, titreComplet);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${titreComplet.replace(/[^\w-]+/g, '_')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{titre}</h3>
          {sous && <p className="text-[11px] text-gray-400 mt-0.5">{sous}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={copier}
            title="Copier l'image du graphique, a coller dans Word ou Excel (Ctrl+V)"
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors ${
              etat === 'copie' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : etat === 'erreur' ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            {etat === 'copie' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {etat === 'copie' ? 'Copie' : etat === 'erreur' ? 'Utilisez PNG' : 'Copier'}
          </button>
          <button
            type="button"
            onClick={telecharger}
            title="Telecharger l'image (PNG)"
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
          >
            <Download className="w-3 h-3" /> PNG
          </button>
        </div>
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-3" role="img" aria-label={titre}>
        {children}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ composant

export function StatsGraphiques({ courses, executions, lignes, exclus, periode = 'semaine', libelle, capacite = 8, seuilMinutes = 10 }: Props) {
  const execByCourse = useMemo(() => {
    const m = new Map<string, ExecutionTrajet>();
    executions.forEach(e => { if (!m.has(e.course_id)) m.set(e.course_id, e); });
    return m;
  }, [executions]);

  // Trajets retenus pour la ponctualite, les durees et la frequentation.
  const coursesStats = useMemo(
    () => (exclus && exclus.size ? courses.filter(c => !exclus.has(c.id)) : courses),
    [courses, exclus],
  );

  // Definitions communes (lib/statutCourse) : un trajet demarre mais jamais
  // cloture a bien eu lieu, un trajet remplace a ete assure par le remplacant.
  const estEffectue = (c: StatCourse) => {
    const e = etatTrajet(c);
    return e === 'effectue' || e === 'demarre';
  };
  const estNonEffectue = (c: StatCourse) => etatTrajet(c) === 'non_effectue';

  // 1 - effectues / non effectues : par jour de la semaine (jour, semaine), par
  // date sur un mois.
  const parJour = useMemo(() => {
    if (periode === 'mois') {
      const parDate = new Map<string, number[]>();
      courses.forEach(c => {
        const j = mDateStr(c.date_heure);
        const a = parDate.get(j) || [0, 0];
        if (estEffectue(c)) a[0] += 1;
        else if (estNonEffectue(c)) a[1] += 1;
        parDate.set(j, a);
      });
      return [...parDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([j, v]) => ({ label: j.slice(8), sous: JOURS[(mParts(`${j}T12:00:00+03:00`).dow + 6) % 7], valeurs: v }));
    }
    const acc = JOURS.map(j => ({ label: j, sous: '', valeurs: [0, 0] }));
    const dates: string[] = ['', '', '', '', '', '', ''];
    courses.forEach(c => {
      const p = mParts(c.date_heure);
      const idx = (p.dow + 6) % 7;                       // dimanche = 0 -> 6
      dates[idx] = mDateStr(c.date_heure).slice(8);
      if (estEffectue(c)) acc[idx].valeurs[0] += 1;
      else if (estNonEffectue(c)) acc[idx].valeurs[1] += 1;
    });
    return acc.map((a, i) => ({ ...a, sous: dates[i] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, periode]);

  const totalEffectues = parJour.reduce((s, d) => s + d.valeurs[0], 0);
  const totalNonEffectues = parJour.reduce((s, d) => s + d.valeurs[1], 0);

  // 2 - ponctualite : avance / a l'heure / retard, par jour et sur la periode
  const ponctualiteParJour = useMemo(() => {
    const parDate = new Map<string, { retard: number; avance: number; heure: number }>();
    coursesStats.forEach(c => {
      const e = execByCourse.get(c.id);
      if (!e?.heure_debut) return;
      const ec = (new Date(e.heure_debut).getTime() - new Date(c.date_heure).getTime()) / 60000;
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
  }, [coursesStats, execByCourse, seuilMinutes]);

  const totauxPonctualite = ponctualiteParJour.reduce(
    (s, d) => [s[0] + d.valeurs[0], s[1] + d.valeurs[1], s[2] + d.valeurs[2]],
    [0, 0, 0],
  );

  // Duree d'un trajet retenue dans les moyennes (null si absente ou aberrante).
  const dureeDe = (c: StatCourse): number | null => {
    const e = execByCourse.get(c.id);
    if (!e) return null;
    const d = dureeExecution(e);
    return d !== null && dureeValide(d) ? d : null;
  };

  // 3 - duree moyenne reelle par jour
  const dureeParJour = useMemo(() => {
    const parDate = new Map<string, { total: number; nb: number }>();
    coursesStats.forEach(c => {
      const min = dureeDe(c);
      if (min === null) return;
      const j = mDateStr(c.date_heure);
      const a = parDate.get(j) || { total: 0, nb: 0 };
      a.total += min; a.nb += 1;
      parDate.set(j, a);
    });
    return [...parDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jour, a]) => ({ jour, moyenne: Math.round((a.total / a.nb) * 10) / 10 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursesStats, execByCourse]);

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
    coursesStats.forEach(c => {
      const min = dureeDe(c);
      if (min === null) return;
      const cle = `${sensDe(c) || 'aller'}|${mParts(c.date_heure).h}`;
      const a = acc.get(cle) || { total: 0, nb: 0 };
      a.total += min; a.nb += 1;
      acc.set(cle, a);
    });
    const serie = (sens: string) => heures.map(h => {
      const a = acc.get(`${sens}|${h}`);
      return a ? Math.round((a.total / a.nb) * 10) / 10 : null;
    });
    return { aller: serie('aller'), retour: serie('retour') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursesStats, execByCourse, heures, lignes]);

  // 5 - usagers par jour = MAX(montees, descentes) de chaque trajet, regle de la
  // direction. Ce total depasse le plus grand des deux cumuls de la page
  // (montees ou descentes) : sur un trajet on retient le plus grand compteur.
  const usagersCourse = (c: StatCourse) => Math.max(c.passagers_depart || 0, c.passagers_arrivee || 0);

  const usagersParJour = useMemo(() => {
    const parDate = new Map<string, number>();
    coursesStats.filter(estEffectue).forEach(c => {
      const j = mDateStr(c.date_heure);
      parDate.set(j, (parDate.get(j) || 0) + usagersCourse(c));
    });
    return [...parDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jour, v]) => ({ label: jour.slice(8), valeurs: [v] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursesStats]);

  // 6 - taux de frequentation par heure de depart
  const tauxParHeure = useMemo(() => {
    const acc = new Map<number, { usagers: number; trajets: number }>();
    coursesStats.filter(estEffectue).forEach(c => {
      const h = mParts(c.date_heure).h;
      const a = acc.get(h) || { usagers: 0, trajets: 0 };
      a.usagers += usagersCourse(c); a.trajets += 1;
      acc.set(h, a);
    });
    return heures.map(h => {
      const a = acc.get(h);
      return a && a.trajets > 0 ? Math.round((a.usagers / (a.trajets * capacite)) * 1000) / 10 : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursesStats, heures, capacite]);

  const libHeures = heures.map(h => `${String(h).padStart(2, '0')}h`);

  function exporterDonnees() {
    const sheets: { name: string; rows: CellValue[][] }[] = [
      { name: 'Effectues', rows: [[periode === 'mois' ? 'Date' : 'Jour', 'Effectues', 'Non effectues'], ...parJour.map(d => [periode === 'mois' ? `${d.sous} ${d.label}` : `${d.label} ${d.sous}`.trim(), d.valeurs[0], d.valeurs[1]] as CellValue[])] },
      { name: 'Ponctualite', rows: [['Jour', "A l'heure", `Avance > ${seuilMinutes} min`, `Retard > ${seuilMinutes} min`], ...ponctualiteParJour.map(d => [d.label, ...d.valeurs] as CellValue[])] },
      { name: 'Duree par jour', rows: [['Date', 'Duree moyenne (min)'], ...dureeParJour.map(d => [d.jour, d.moyenne] as CellValue[])] },
      { name: 'Duree par heure', rows: [['Heure', 'Aller (min)', 'Retour (min)'], ...libHeures.map((h, i) => [h, dureeParHeure.aller[i], dureeParHeure.retour[i]] as CellValue[])] },
      { name: 'Usagers par jour', rows: [['Jour', 'Usagers'], ...usagersParJour.map(d => [d.label, d.valeurs[0]] as CellValue[])] },
      { name: 'Frequentation', rows: [['Heure', 'Taux (%)'], ...libHeures.map((h, i) => [h, tauxParHeure[i]] as CellValue[])] },
    ];
    downloadSpreadsheet(`Graphiques_CADEMA_${(libelle || 'periode').replace(/[^\w-]+/g, '_')}`, sheets);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Statistiques CADEMA</h2>
          <p className="text-[11px] text-gray-400">
            Sur la periode et la ligne selectionnees en haut de page. Les durees et les heures reelles
            proviennent de l'appli chauffeur, corrections de "Stats par ligne" comprises ; les durees
            inferieures a 2 min ou superieures a {DUREE_MAX_VALIDE} min (trajet non cloture) sont ecartees.
          </p>
        </div>
        <button
          type="button"
          onClick={exporterDonnees}
          title="Toutes les donnees des graphiques, une feuille par graphique"
          className="btn-secondary !py-1.5 !text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Donnees (Excel)
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Cadre libelle={libelle} titre="Trajets effectues / non effectues" sous={periode === 'mois' ? 'Par date, sur le mois' : 'Par jour de la semaine, sur la periode'}>
          <BarresEmpilees
            data={parJour}
            series={[{ couleur: COUL.effectue, libelle: 'Effectues' }, { couleur: COUL.nonEffectue, libelle: 'Non effectues' }]}
            unite="trajets"
          />
        </Cadre>

        <Cadre libelle={libelle} titre="Part des trajets effectues" sous="Ensemble de la periode">
          <Secteurs parts={[
            { valeur: totalEffectues, couleur: COUL.effectue, libelle: 'Effectues' },
            { valeur: totalNonEffectues, couleur: COUL.nonEffectue, libelle: 'Non effectues' },
          ]} />
        </Cadre>

        <Cadre libelle={libelle} titre={`Ponctualite au depart (seuil ${seuilMinutes} min)`} sous="Par jour : a l'heure, en avance, en retard">
          <BarresEmpilees
            data={ponctualiteParJour}
            series={[
              { couleur: COUL.heure, libelle: "A l'heure" },
              { couleur: COUL.avance, libelle: 'En avance' },
              { couleur: COUL.retard, libelle: 'En retard' },
            ]}
            unite="trajets"
          />
        </Cadre>

        <Cadre libelle={libelle} titre="Repartition de la ponctualite" sous="Ensemble de la periode">
          <Secteurs parts={[
            { valeur: totauxPonctualite[0], couleur: COUL.heure, libelle: "A l'heure" },
            { valeur: totauxPonctualite[1], couleur: COUL.avance, libelle: `En avance > ${seuilMinutes} min` },
            { valeur: totauxPonctualite[2], couleur: COUL.retard, libelle: `En retard > ${seuilMinutes} min` },
          ]} />
        </Cadre>

        <Cadre libelle={libelle} titre="Duree moyenne des trajets" sous="Par jour, en minutes">
          <Courbes
            labels={dureeParJour.map(d => d.jour.slice(8))}
            series={[{ couleur: COUL.aller, libelle: 'Duree moyenne', valeurs: dureeParJour.map(d => d.moyenne) }]}
            unite="minutes"
          />
        </Cadre>

        <Cadre libelle={libelle} titre="Duree moyenne par heure de depart" sous="Aller et retour distingues, en minutes">
          <Courbes
            labels={libHeures}
            series={[
              { couleur: COUL.aller, libelle: 'Aller', valeurs: dureeParHeure.aller },
              { couleur: COUL.retour, libelle: 'Retour', valeurs: dureeParHeure.retour },
            ]}
            unite="minutes"
          />
        </Cadre>

        <Cadre libelle={libelle} titre="Usagers par jour" sous="Somme, trajet par trajet, du plus grand des deux compteurs (montees, descentes)">
          <BarresEmpilees
            data={usagersParJour}
            series={[{ couleur: COUL.usagers, libelle: 'Usagers' }]}
            unite="usagers"
          />
        </Cadre>

        <Cadre libelle={libelle} titre="Taux de frequentation par heure de depart" sous={`Usagers rapportes a ${capacite} places par trajet, en %`}>
          <Courbes
            labels={libHeures}
            series={[{ couleur: COUL.taux, libelle: 'Taux', valeurs: tauxParHeure }]}
            unite="%"
          />
        </Cadre>
      </div>
    </div>
  );
}
