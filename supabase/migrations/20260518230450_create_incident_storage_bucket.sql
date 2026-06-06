/*
  # Create storage bucket for incident media

  1. New Storage
    - `incidents` bucket for storing photos and audio recordings from incident reports
    - Public access enabled so media can be displayed in the app

  2. Security
    - Allow anonymous uploads (drivers are not authenticated via Supabase Auth)
    - Allow public read access for viewing media
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('incidents', 'incidents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public read on incidents bucket"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'incidents');

CREATE POLICY "Allow anon insert on incidents bucket"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'incidents');
