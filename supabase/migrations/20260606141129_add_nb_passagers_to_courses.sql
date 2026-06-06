ALTER TABLE courses ADD COLUMN IF NOT EXISTS nb_passagers integer DEFAULT 0;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS passagers_depart integer DEFAULT 0;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS passagers_arrivee integer DEFAULT 0;