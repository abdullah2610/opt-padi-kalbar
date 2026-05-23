-- 001_postgis.sql — enable PostGIS extension
-- Supabase free plan supports PostGIS. Idempotent.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'postgis extension not installed';
  END IF;
END
$$;
