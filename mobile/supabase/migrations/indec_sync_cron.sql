-- ══════════════════════════════════════════════════════════════════════════════
-- Setup: auto-sync mensual de inflación INDEC
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Habilitar extensiones (si no están activas ya)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Guardar service_role_key en configuración de la DB
--    REEMPLAZAR 'YOUR_SERVICE_ROLE_KEY' con la clave de:
--    Supabase Dashboard → Settings → API → service_role key
ALTER DATABASE postgres
  SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- 3. Crear job mensual (día 16 a las 12:00 UTC — INDEC publica alrededor del 14-15)
SELECT cron.schedule(
  'indec-monthly-sync',
  '0 12 16 * *',
  $$
  SELECT net.http_post(
    url     := 'https://gqflukmlaonkgxfdbedq.supabase.co/functions/v1/indec-sync',
    headers := ('{"Authorization":"Bearer '
                  || current_setting('app.settings.service_role_key')
                  || '","Content-Type":"application/json"}')::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verificar que quedó registrado:
-- SELECT * FROM cron.job WHERE jobname = 'indec-monthly-sync';

-- Para forzar una corrida manual de prueba:
-- SELECT net.http_post(
--   url     := 'https://gqflukmlaonkgxfdbedq.supabase.co/functions/v1/indec-sync',
--   headers := ('{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}')::jsonb,
--   body    := '{}'::jsonb
-- );
