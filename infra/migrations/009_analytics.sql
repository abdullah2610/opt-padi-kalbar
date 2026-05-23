-- 009_analytics.sql — stress/drought detection helpers (called after ETL insert)

CREATE OR REPLACE FUNCTION detect_stress(p_kab text)
RETURNS void AS $$
DECLARE
  recent_z real[];
BEGIN
  SELECT array_agg(anomaly_z ORDER BY observation_date DESC)
  INTO recent_z
  FROM (
    SELECT anomaly_z, observation_date
    FROM vegetation_indices
    WHERE kabupaten_id = p_kab AND index_name = 'ndvi' AND anomaly_z IS NOT NULL
    ORDER BY observation_date DESC
    LIMIT 2
  ) sub;

  IF recent_z IS NOT NULL AND array_length(recent_z, 1) >= 2
     AND recent_z[1] < -1.5 AND recent_z[2] < -1.5 THEN
    INSERT INTO alerts (kabupaten_id, type, severity, started_at, payload)
    VALUES (
      p_kab,
      'stress',
      'med',
      NOW(),
      jsonb_build_object('z_scores', recent_z, 'source', 'detect_stress')
    );
  END IF;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION compute_anomaly_z(
  p_kab text,
  p_index text,
  p_obs_date date,
  p_mean real
) RETURNS real AS $$
DECLARE
  b_mean real;
  b_std real;
  doy int;
BEGIN
  doy := EXTRACT(DOY FROM p_obs_date)::int;
  SELECT mean, std INTO b_mean, b_std
  FROM index_baselines
  WHERE kabupaten_id = p_kab AND index_name = p_index AND doy = doy;
  IF b_mean IS NULL OR b_std IS NULL OR b_std = 0 THEN
    RETURN NULL;
  END IF;
  RETURN (p_mean - b_mean) / b_std;
END
$$ LANGUAGE plpgsql;
