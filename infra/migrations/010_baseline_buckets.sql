-- 010_baseline_buckets.sql — fix compute_anomaly_z bug + DOY bucketing helper
-- Composite Sentinel-2 di 10-hari window → DOY observasi tiap composite agak bergeser tiap tahun.
-- Solusi: bucket DOY ke kelipatan 10 (midpoint 5,15,25,...365) supaya group/sample padat.

-- Helper: DOY bucket (10-day midpoint). DOY 1-10 → 5, 11-20 → 15, ...
CREATE OR REPLACE FUNCTION doy_bucket(p_doy int) RETURNS int AS $$
BEGIN
  RETURN ((p_doy - 1) / 10) * 10 + 5;
END
$$ LANGUAGE plpgsql IMMUTABLE;

-- Convenience: DOY bucket from date
CREATE OR REPLACE FUNCTION doy_bucket_from_date(p_date date) RETURNS int AS $$
BEGIN
  RETURN doy_bucket(EXTRACT(DOY FROM p_date)::int);
END
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fix compute_anomaly_z:
-- 1) Variable shadowing (doy = doy → always TRUE)
-- 2) Use DOY bucket (±5 days tolerance via bucket midpoint match)
-- 3) Fallback to nearest bucket if exact missing
CREATE OR REPLACE FUNCTION compute_anomaly_z(
  p_kab text,
  p_index text,
  p_obs_date date,
  p_mean real
) RETURNS real AS $$
DECLARE
  b_mean real;
  b_std real;
  v_bucket int;
BEGIN
  v_bucket := doy_bucket_from_date(p_obs_date);

  -- Exact bucket match first
  SELECT mean, std INTO b_mean, b_std
  FROM index_baselines
  WHERE kabupaten_id = p_kab
    AND index_name = p_index
    AND doy = v_bucket
  LIMIT 1;

  -- Fallback: nearest bucket within ±20 days
  IF b_mean IS NULL THEN
    SELECT mean, std INTO b_mean, b_std
    FROM index_baselines
    WHERE kabupaten_id = p_kab
      AND index_name = p_index
      AND doy BETWEEN v_bucket - 20 AND v_bucket + 20
    ORDER BY ABS(doy - v_bucket) ASC
    LIMIT 1;
  END IF;

  IF b_mean IS NULL OR b_std IS NULL OR b_std = 0 THEN
    RETURN NULL;
  END IF;
  RETURN (p_mean - b_mean) / b_std;
END
$$ LANGUAGE plpgsql STABLE;

-- View untuk visualisasi: per kabupaten + index, plot mean ± std vs DOY bucket
CREATE OR REPLACE VIEW baseline_summary AS
SELECT
  kabupaten_id,
  index_name,
  COUNT(*) AS n_buckets,
  AVG(mean)::real AS overall_mean,
  AVG(std)::real AS avg_std,
  SUM(sample_count) AS total_samples,
  MIN(computed_at) AS computed_at
FROM index_baselines
GROUP BY kabupaten_id, index_name;

GRANT SELECT ON baseline_summary TO anon, authenticated;

COMMENT ON FUNCTION compute_anomaly_z IS 'Z-score vs baseline per DOY bucket (10-day). Fallback ke bucket terdekat ±20 hari.';
COMMENT ON FUNCTION doy_bucket IS 'DOY bucket midpoint: 1-10→5, 11-20→15, ..., 361-366→365';
