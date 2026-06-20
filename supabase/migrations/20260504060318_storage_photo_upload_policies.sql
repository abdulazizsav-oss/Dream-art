-- Dream Art CRM photo storage buckets and upload policies.
-- Public buckets make saved image URLs readable, but uploads still require
-- storage.objects RLS policies for authenticated users.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'equipment-photos',
    'equipment-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'category-photos',
    'category-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'brand-logos',
    'brand-logos',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
  ),
  (
    'client-photos',
    'client-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = now();

DROP POLICY IF EXISTS "authenticated_manage_dream_art_photo_objects" ON storage.objects;

CREATE POLICY "authenticated_manage_dream_art_photo_objects"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id IN (
    'equipment-photos',
    'category-photos',
    'brand-logos',
    'client-photos'
  )
)
WITH CHECK (
  bucket_id IN (
    'equipment-photos',
    'category-photos',
    'brand-logos',
    'client-photos'
  )
);
