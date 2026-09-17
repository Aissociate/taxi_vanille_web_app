import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

// Lecture seule (roles du back office, lib/roles) : sur une page ouverte "en
// lecture", toute ecriture en base est refusee ici, avant d'atteindre le
// serveur. Les pages affichent deja le message d'erreur renvoye. Restent
// permis : les fonctions de consultation (rpc) et les signalements de bugs.
let lectureSeule = false;
export function setLectureSeule(v: boolean) { lectureSeule = v; }

const ECRITURES_PERMISES = /\/rest\/v1\/(rpc\/|bugs|bug_responses|dev_proposals|proposal_votes|proposal_responses)/;

const fetchControle: typeof fetch = (input, init) => {
  const methode = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (lectureSeule && methode !== 'GET' && methode !== 'HEAD' && url.includes('/rest/v1/') && !ECRITURES_PERMISES.test(url)) {
    const corps = JSON.stringify({ message: 'Lecture seule : votre role ne permet pas de modifier cette page.', code: 'lecture_seule' });
    return Promise.resolve(new Response(corps, { status: 403, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'x-app-source': 'admin',
    },
    fetch: fetchControle,
  },
});
