export type IndexName = 'ndvi' | 'ndwi' | 'mndwi' | 'ndmi' | 'msi' | 'evi';

export interface KabupatenSummary {
  id: string;
  kode_bps: string;
  nama: string;
  jenis: 'kabupaten' | 'kota';
  bbox: [number, number, number, number];
  centroid: [number, number];
}

export interface IndexPoint {
  observation_date: string;
  kabupaten_id: string;
  index_name: IndexName;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  std: number;
  anomaly_z: number;
  area_clear_pct: number;
}

export type AlertType =
  | 'stress' | 'flood' | 'drought'
  | 'disease_blast' | 'disease_hdb' | 'disease_wereng' | 'disease_bercak_coklat';

export type AlertSeverity = 'low' | 'med' | 'high';

export interface Alert {
  id: string;
  kabupaten_id: string;
  type: AlertType;
  severity: AlertSeverity;
  started_at: string;
  resolved_at: string | null;
  payload: Record<string, unknown>;
}

export interface YieldEstimate {
  kabupaten_id: string;
  season: string;
  ton_estimated: number;
  ton_per_ha: number;
  area_sawah_ha: number;
  model_version: string;
  confidence: number;
  features_used: Record<string, unknown>;
  computed_at: string;
}

export interface LandcoverClass {
  kabupaten_id: string;
  observation_date: string;
  source: string;
  class_code: number;
  class_name: string;
  area_ha: number;
  area_pct: number;
}

export type RiskLevel = 'none' | 'low' | 'med' | 'high';

export interface DiseaseRisk {
  kabupaten_id: string;
  cumulative: Record<string, number>;
  daily_rain_7d_mm: number;
  ndmi_p10: number | null;
  risk: { blast: RiskLevel; hdb: RiskLevel; wereng: RiskLevel };
}

export interface CompositeMeta {
  period_start: string;
  period_end: string;
  scl_clear_pct: number;
  cog_paths: Record<string, string>;
  status: string;
  cropland_area_ha?: number | null;
}
