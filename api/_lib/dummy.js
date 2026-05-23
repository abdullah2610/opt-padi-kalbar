// Deterministic dummy data generators.
// Pakai seeded random + realistic seasonal pattern utk Kalbar (2 musim tanam).
// Hilang setelah Phase 2 ETL real data terisi.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function phenologyNdvi(dayOfYear, offset) {
  // 2 musim tanam Kalbar: MT1 (Oct-Feb), MT2 (Apr-Aug)
  // Sinusoid 2 puncak per tahun, amplitude ~0.4 around 0.5
  const w1 = Math.sin(((dayOfYear - 90) / 366) * 2 * Math.PI);
  const w2 = Math.sin(((dayOfYear - 90) / 183) * 2 * Math.PI);
  const base = 0.55 + 0.25 * (w2 + 0.4 * w1);
  return Math.max(0.05, Math.min(0.9, base + offset));
}

export function dummyIndicesSeries(kabupatenId, indexName, fromDate, toDate) {
  const out = [];
  const seedBase = hash(kabupatenId);
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const dayMs = 86400 * 1000;
  for (let t = start.getTime(); t <= end.getTime(); t += 10 * dayMs) {
    const d = new Date(t);
    const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / dayMs);
    const jitter = (seededRand(seedBase + doy) - 0.5) * 0.08;
    const ndvi = phenologyNdvi(doy, jitter);

    let mean;
    switch (indexName) {
      case 'ndvi': mean = ndvi; break;
      case 'evi': mean = ndvi * 1.05; break;
      case 'ndmi': mean = ndvi * 0.45 - 0.05; break;
      case 'ndwi': mean = -ndvi * 0.4 + 0.05; break;
      case 'mndwi': mean = -ndvi * 0.5 + 0.1 + (seededRand(seedBase + doy + 7) - 0.5) * 0.15; break;
      case 'msi': mean = 1.0 / Math.max(0.2, ndvi); break;
      default: mean = ndvi;
    }
    const std = 0.05 + seededRand(seedBase + doy + 11) * 0.08;
    out.push({
      observation_date: d.toISOString().slice(0, 10),
      kabupaten_id: kabupatenId,
      index_name: indexName,
      mean: +mean.toFixed(4),
      p10: +(mean - std).toFixed(4),
      p50: +mean.toFixed(4),
      p90: +(mean + std).toFixed(4),
      std: +std.toFixed(4),
      anomaly_z: +((seededRand(seedBase + doy + 13) - 0.5) * 2.6).toFixed(2),
      area_clear_pct: +(50 + seededRand(seedBase + doy + 17) * 45).toFixed(1)
    });
  }
  return out;
}

export function dummyAlerts(kabupatenId) {
  const seed = hash(kabupatenId);
  const r = (i) => seededRand(seed + i);
  const today = new Date();
  const types = ['stress', 'drought', 'flood', 'disease_blast', 'disease_hdb', 'disease_wereng'];
  const severities = ['low', 'med', 'high'];
  const out = [];
  // 0-3 active alerts per kabupaten
  const n = Math.floor(r(0) * 3.5);
  for (let i = 0; i < n; i++) {
    const ago = Math.floor(r(i * 3 + 1) * 14) + 1;
    out.push({
      id: `dummy-${kabupatenId}-${i}`,
      kabupaten_id: kabupatenId,
      type: types[Math.floor(r(i * 3 + 2) * types.length)],
      severity: severities[Math.floor(r(i * 3 + 3) * severities.length)],
      started_at: new Date(today.getTime() - ago * 86400000).toISOString(),
      resolved_at: null,
      payload: { dummy: true, signal_count: 1 + Math.floor(r(i * 3 + 4) * 3) }
    });
  }
  return out;
}

export function dummyYield(kabupatenId, season) {
  const seed = hash(`${kabupatenId}-${season}`);
  const tonPerHa = 3.2 + seededRand(seed) * 1.8;        // 3.2-5.0
  const areaHa = 5000 + seededRand(seed + 1) * 40000;   // 5k-45k ha
  return {
    kabupaten_id: kabupatenId,
    season,
    ton_estimated: +(tonPerHa * areaHa).toFixed(1),
    ton_per_ha: +tonPerHa.toFixed(2),
    area_sawah_ha: +areaHa.toFixed(0),
    model_version: 'dummy-v0',
    confidence: +(0.55 + seededRand(seed + 2) * 0.25).toFixed(2),
    features_used: { dummy: true, ndvi_peak: +(0.7 + seededRand(seed + 3) * 0.15).toFixed(3) },
    computed_at: new Date().toISOString()
  };
}

export function dummyLandcover(kabupatenId, date) {
  const seed = hash(`${kabupatenId}-${date}`);
  // Khas Kalbar: ~50% tree cover, 25% cropland, 10% built/bare, 15% water/wetland
  const dist = [
    { class_code: 10, class_name: 'tree_cover',     pct_base: 50 },
    { class_code: 40, class_name: 'cropland',       pct_base: 22 },
    { class_code: 50, class_name: 'built_up',       pct_base: 4 },
    { class_code: 60, class_name: 'bare_sparse_veg',pct_base: 3 },
    { class_code: 80, class_name: 'permanent_water',pct_base: 8 },
    { class_code: 90, class_name: 'herbaceous_wet', pct_base: 5 },
    { class_code: 95, class_name: 'mangroves',      pct_base: 3 },
    { class_code: 20, class_name: 'shrubland',      pct_base: 5 }
  ];
  let total = 0;
  const noisy = dist.map((d, i) => {
    const pct = Math.max(0, d.pct_base + (seededRand(seed + i) - 0.5) * 6);
    total += pct;
    return { ...d, pct };
  });
  return noisy.map((d) => ({
    kabupaten_id: kabupatenId,
    observation_date: date,
    source: 'esa_worldcover',
    class_code: d.class_code,
    class_name: d.class_name,
    area_ha: +(d.pct / total * 500000).toFixed(0), // assume 500k ha sample
    area_pct: +(d.pct / total * 100).toFixed(1)
  }));
}
