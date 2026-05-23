// Ported & extended from soil-moisture-dashboard/ml/THRESHOLDS.md
// Disease risk thresholds + satellite integration (NDMI canopy moisture)

export const DISEASE_THRESHOLDS = Object.freeze({
  blast: {
    rh_min: 85,
    temp_min: 24,
    temp_max: 28,
    rain7d_min_high: 20,
    rain7d_min_med: 10,
    favorable_days_high: 3,
    favorable_days_med: 1
  },
  hdb: {
    rh72h_min_high: 30,
    rh72h_min_med: 15,
    heavy_rain_hours_high: 4,
    heavy_rain_hours_med: 2
  },
  wereng: {
    rh_min: 78,
    temp_min: 22,
    temp_max: 32,
    warm_humid_hours_high: 48,
    warm_humid_hours_med: 24
  },
  bercak_coklat: {
    rh_min: 85,
    temp_min: 25,
    temp_max: 30,
    rain7d_min_med: 15
  }
});

// Anomaly z-score
export const ANOMALY = Object.freeze({
  stress_z_threshold: -1.5,
  stress_consec_composites: 2,
  msi_water_stress_min: 1.2,
  ndmi_canopy_wet_max: 0.1,    // boost blast risk +1 jika NDMI p10 < 0.1
  ndmi_drought_max: 0.0
});

// Drought combine signals
export const DROUGHT = Object.freeze({
  precip_30d_min_mm: 100,
  ndvi_z_threshold: -1.5,
  ndmi_p50_max: 0.0
});

// Flood
export const FLOOD = Object.freeze({
  mndwi_min: 0.3
});

// NDVI phenology bands for padi (Subang model)
export const NDVI_PHENOLOGY = Object.freeze([
  { max: 0.18, phase: 'persiapan_lahan' },
  { max: 0.4, phase: 'vegetatif_awal' },
  { max: 0.65, phase: 'vegetatif_lanjut' },
  { max: 0.8, phase: 'generatif' },
  { max: 1.0, phase: 'matang_panen' }
]);

export function phenologyPhase(ndvi) {
  for (const band of NDVI_PHENOLOGY) if (ndvi <= band.max) return band.phase;
  return 'unknown';
}
