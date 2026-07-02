// Heure de Mayotte (Indian/Mayotte = UTC+3, SANS changement d'heure).
//
// Regle metier : le planning fait foi. Toute heure saisie par un directeur EST
// une heure de Mayotte, et tout le monde (planning, chauffeur, coordinateur) doit
// voir exactement la meme heure, quel que soit le fuseau de l'appareil.
//
// Principe : un instant (`new Date()`, ou une valeur timestamptz) est ABSOLU,
// identique sur tous les appareils. En lisant systematiquement ses composantes
// EN HEURE DE MAYOTTE (et jamais `getHours()`/`getDate()` du navigateur), l'appli
// devient totalement independante du fuseau local. Mayotte n'ayant pas de DST,
// il suffit de decaler l'instant de +3h et de lire ses champs UTC.

export const MAYOTTE_TZ = 'Indian/Mayotte';
export const MAYOTTE_OFFSET = '+03:00';
const OFFSET_MS = 3 * 3600 * 1000;
const p2 = (n: number) => String(n).padStart(2, '0');

function asDate(v: string | Date): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

/** Composantes calendaires en heure de Mayotte. dow: 0=dimanche..6=samedi. */
export function mParts(v: string | Date): { y: number; mo: number; d: number; h: number; mi: number; dow: number } {
  const s = new Date(asDate(v).getTime() + OFFSET_MS);
  return { y: s.getUTCFullYear(), mo: s.getUTCMonth(), d: s.getUTCDate(), h: s.getUTCHours(), mi: s.getUTCMinutes(), dow: s.getUTCDay() };
}

/** "YYYY-MM-DD" du jour de Mayotte contenant l'instant. */
export function mDateStr(v: string | Date): string {
  const p = mParts(v);
  return `${p.y}-${p2(p.mo + 1)}-${p2(p.d)}`;
}

/** "YYYY-MM-DDTHH:MM" en heure de Mayotte (pour remplir un <input datetime-local>). */
export function mInputStr(v: string | Date): string {
  const p = mParts(v);
  return `${p.y}-${p2(p.mo + 1)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}`;
}

/** Heure decimale (ex. 6.5 pour 06:30) en heure de Mayotte. */
export function mHour(v: string | Date): number {
  const p = mParts(v);
  return p.h + p.mi / 60;
}

/** Jour de semaine en heure de Mayotte (0=dimanche..6=samedi). */
export function mDow(v: string | Date): number {
  return mParts(v).dow;
}

/** Deux instants tombent-ils le meme jour calendaire de Mayotte ? */
export function mSameDay(a: string | Date, b: string | Date): boolean {
  return mDateStr(a) === mDateStr(b);
}

/** Instant de MINUIT (heure de Mayotte) d'un jour "YYYY-MM-DD". */
export function mMidnightISO(dateStr: string): string {
  return `${dateStr}T00:00:00${MAYOTTE_OFFSET}`;
}

/** "YYYY-MM-DDTHH:MM" (heure de Mayotte saisie) -> instant ISO absolu. */
export function mInputToISO(input: string): string {
  return `${input.slice(0, 16)}:00${MAYOTTE_OFFSET}`;
}

/** Instant de midi (heure de Mayotte) d'un jour "YYYY-MM-DD" — pratique comme
 *  ancre de "jour courant" insensible aux bords de minuit. */
export function mNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00${MAYOTTE_OFFSET}`);
}

/** Lundi (jour de Mayotte, "YYYY-MM-DD") de la semaine contenant l'instant. */
export function mMondayStr(v: string | Date): string {
  const p = mParts(v);
  const dow = p.dow || 7; // dimanche(0) -> 7
  const noon = mNoon(`${p.y}-${p2(p.mo + 1)}-${p2(p.d)}`);
  const monday = new Date(noon.getTime() - (dow - 1) * 86400000);
  return mDateStr(monday);
}

/** Ajoute nDays au jour de Mayotte, renvoie "YYYY-MM-DD". */
export function mAddDaysStr(dateStr: string, nDays: number): string {
  return mDateStr(new Date(mNoon(dateStr).getTime() + nDays * 86400000));
}

/** Formatage d'affichage court "HH:MM" en heure de Mayotte. */
export function fmtHM(v: string | Date): string {
  return asDate(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: MAYOTTE_TZ });
}
