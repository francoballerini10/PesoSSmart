-- ============================================================
-- Pesos$mart — Storage Buckets y Políticas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Crear buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'expense-receipts',
    'expense-receipts',
    false,           -- privado
    10485760,        -- 10MB máx por archivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'report-pdfs',
    'report-pdfs',
    false,
    5242880,         -- 5MB
    ARRAY['application/pdf']
  ),
  (
    'avatars',
    'avatars',
    true,            -- público
    2097152,         -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO NOTHING;

-- ---- Políticas de storage: expense-receipts ----

-- Upload: cada usuario sube en su propia carpeta (user_id/filename)
CREATE POLICY "receipt upload: own folder only"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- View: solo puede ver sus propios receipts
CREATE POLICY "receipt view: own only"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete: puede borrar los suyos
CREATE POLICY "receipt delete: own only"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ---- Políticas de storage: report-pdfs ----

CREATE POLICY "report pdf: own folder only upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'report-pdfs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "report pdf: own only view"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'report-pdfs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ---- Políticas de storage: avatars (público) ----

CREATE POLICY "avatar upload: own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "avatar view: public"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "avatar update: own only"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
