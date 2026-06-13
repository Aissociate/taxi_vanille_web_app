-- Add coordinator forfait columns to factures
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS forfait_coordinateur_samedi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forfait_coordinateur_dimanche numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_samedis_coordinateur integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_dimanches_coordinateur integer DEFAULT 0;

-- Add coordinator assignment to astreintes (assign coordinator per line/slot)
ALTER TABLE public.astreintes
  ADD COLUMN IF NOT EXISTS coordinateur_id uuid REFERENCES public.chauffeurs(id);
