-- Add contact fields for clients (interlocuteur principal + 2 secondaires)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS contact1_nom text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact1_telephone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact1_email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact1_fonction text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact2_nom text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact2_telephone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact2_email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact2_fonction text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact3_nom text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact3_telephone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact3_email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact3_fonction text DEFAULT '';
