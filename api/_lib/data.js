// Supabase data access with graceful fallback when DB empty or env missing.

import { supabaseAnon } from './supabase.js';

export function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// When cropland display is active, auto-append _crop suffix so frontend always
// requests base name (e.g. "ndvi") and receives cropland-only values transparently.
function resolveCropIndex(indexName) {
  const cropEnabled = process.env.VITE_DISPLAY_CROPLAND_DEFAULT === 'true'
    || process.env.DISPLAY_CROPLAND_DEFAULT === 'true';
  if (!cropEnabled) return indexName;
  if (indexName.endsWith('_crop')) return indexName; // already suffixed
  return `${indexName}_crop`;
}

export async function fetchIndicesSeries(kabupatenId, indexName, from, to) {
  const resolvedIndex = resolveCropIndex(indexName);
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('vegetation_indices')
    .select(
      'observation_date, kabupaten_id, index_name, mean, p10, p50, p90, std, anomaly_z, area_clear_pct'
    )
    .eq('kabupaten_id', kabupatenId)
    .eq('index_name', resolvedIndex)
    .gte('observation_date', from)
    .lte('observation_date', to)
    .order('observation_date')
    .limit(400); // Sentinel-2 ~36 rows/year/index; cap ≈ 10 years of data
  if (error) throw error;
  return data ?? [];
}

export async function fetchAlerts({ kabupatenId, type, severity } = {}) {
  const sb = supabaseAnon();
  let q = sb
    .from('alerts')
    .select('id, kabupaten_id, type, severity, started_at, resolved_at, payload')
    .is('resolved_at', null)
    .order('started_at', { ascending: false })
    .limit(200);
  if (kabupatenId) q = q.eq('kabupaten_id', kabupatenId);
  if (type) q = q.eq('type', type);
  if (severity) q = q.eq('severity', severity);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCompositeMeta(kabupatenId) {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('sentinel_composites')
    .select('period_start, period_end, cog_paths, scl_clear_pct, status, indices_stats')
    .eq('kabupaten_id', kabupatenId)
    .eq('status', 'completed')
    .order('period_end', { ascending: false })
    .limit(24);
  if (error) throw error;
  return data ?? [];
}

export async function fetchYieldEstimate(kabupatenId, season) {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('yield_estimates')
    .select('*')
    .eq('kabupaten_id', kabupatenId)
    .eq('season', season)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchLandcover(kabupatenId, observationDate) {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('landcover')
    .select('class_code, class_name, area_ha, area_pct, source')
    .eq('kabupaten_id', kabupatenId)
    .eq('observation_date', observationDate)
    .order('area_pct', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
