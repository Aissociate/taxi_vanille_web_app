/*
# Timer Segments Table (registration of existing table)

1. New Tables
  - `timer_segments` - stores passage time between stops for the Timer app
    - `id` (uuid, primary key)
    - `course_id` (uuid, FK to courses)
    - `ligne_id` (uuid)
    - `chauffeur_id` (uuid)
    - `arret_depart_id` (uuid)
    - `arret_arrivee_id` (uuid)
    - `ordre` (integer)
    - `heure_start` (timestamptz)
    - `heure_stop` (timestamptz)
    - `duree_secondes` (integer)
    - `jour` (date)
    - `user_id` (uuid)
    - `created_at` (timestamptz)

2. Security
  - RLS enabled
  - Anon can insert/select/update (chauffeur-id gated for insert/update)
  - Authenticated users have full access

3. Indexes
  - idx_timer_segments_ligne
  - idx_timer_segments_chauffeur
  - idx_timer_segments_jour
*/

CREATE TABLE IF NOT EXISTS public.timer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  ligne_id         uuid,
  chauffeur_id     uuid,
  arret_depart_id  uuid,
  arret_arrivee_id uuid,
  ordre            integer,
  heure_start      timestamptz NOT NULL,
  heure_stop       timestamptz,
  duree_secondes   integer,
  jour             date,
  user_id          uuid,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.timer_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can insert timer segments" ON public.timer_segments;
CREATE POLICY "Anon can insert timer segments" ON public.timer_segments
  FOR INSERT TO anon WITH CHECK (chauffeur_id IS NOT NULL);

DROP POLICY IF EXISTS "Anon can view timer segments" ON public.timer_segments;
CREATE POLICY "Anon can view timer segments" ON public.timer_segments
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can update timer segments" ON public.timer_segments;
CREATE POLICY "Anon can update timer segments" ON public.timer_segments
  FOR UPDATE TO anon USING (chauffeur_id IS NOT NULL) WITH CHECK (chauffeur_id IS NOT NULL);

DROP POLICY IF EXISTS "Auth view timer segments" ON public.timer_segments;
CREATE POLICY "Auth view timer segments" ON public.timer_segments
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth manage timer segments" ON public.timer_segments;
CREATE POLICY "Auth manage timer segments" ON public.timer_segments
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_timer_segments_ligne ON public.timer_segments(ligne_id);
CREATE INDEX IF NOT EXISTS idx_timer_segments_chauffeur ON public.timer_segments(chauffeur_id);
CREATE INDEX IF NOT EXISTS idx_timer_segments_jour ON public.timer_segments(jour);
