// Port computeCumulativeMetrics dari soil-moisture-dashboard/api/weather.js
// + boost faktor satelit (NDMI canopy moisture)
// Public read-only. Dummy fallback bila Open-Meteo gagal.

import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { getKabupaten } from './_lib/kabupaten.js';
import { kabupatenIdSchema } from './_lib/validate.js';
import { DISEASE_THRESHOLDS, ANOMALY } from './_lib/thresholds.js';
import { dummyIndicesSeries } from './_lib/dummy.js';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m,relative_humidity_2m,precipitation',
    daily: 'precipitation_sum',
    past_days: '7',
    forecast_days: '3',
    timezone: 'Asia/Jakarta',
    timeformat: 'unixtime'
  });
  const res = await fetch(`${OPEN_METEO}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

function computeCumulativeMetrics(time, temp, rh, rain, startIdx, currentIdx) {
  let rh85_hours_7d = 0;
  let rh85_hours_72h = 0;
  let blast_fav_hours = 0;
  let hdb_rain_hours_7d = 0;
  let warm_humid_hours_7d = 0;
  let heavy_rain_hours = 0;
  let maxConsecHumid = 0;
  let curConsecHumid = 0;
  const start72h = Math.max(startIdx, currentIdx - 71);
  const dayBuckets = {};

  for (let i = startIdx; i <= currentIdx; i++) {
    const r = rh[i];
    const t = temp[i];
    const p = rain[i] || 0;
    const dk = new Date(time[i] * 1000).toISOString().slice(0, 10);
    if (!dayBuckets[dk]) dayBuckets[dk] = { rh85: 0, blastFav: 0 };

    if (r >= 85) {
      rh85_hours_7d++;
      curConsecHumid++;
      maxConsecHumid = Math.max(maxConsecHumid, curConsecHumid);
      dayBuckets[dk].rh85++;
    } else {
      curConsecHumid = 0;
    }
    if (r >= 85 && t >= 24 && t <= 28) {
      blast_fav_hours++;
      dayBuckets[dk].blastFav++;
    }
    if (i >= start72h && r >= 85) rh85_hours_72h++;
    if (p > 1) hdb_rain_hours_7d++;
    if (p > 5) heavy_rain_hours++;
    if (r >= 78 && t >= 22 && t <= 32) warm_humid_hours_7d++;
  }

  return {
    rh85_hours_7d,
    rh85_hours_72h,
    blast_fav_hours,
    blast_favorable_days: Object.values(dayBuckets).filter((d) => d.blastFav >= 8).length,
    high_humid_days: Object.values(dayBuckets).filter((d) => d.rh85 >= 8).length,
    hdb_rain_hours_7d,
    heavy_rain_hours,
    warm_humid_hours_7d,
    max_consec_humid_hours: maxConsecHumid
  };
}

function scoreBlast(cumulative, dailyRain7d, ndmiP10) {
  const t = DISEASE_THRESHOLDS.blast;
  let level = 'none';
  if (cumulative.blast_favorable_days >= t.favorable_days_high && dailyRain7d >= t.rain7d_min_high) level = 'high';
  else if (cumulative.blast_favorable_days >= t.favorable_days_med && dailyRain7d >= t.rain7d_min_med) level = 'med';
  else if (cumulative.blast_fav_hours >= 12) level = 'low';
  if (ndmiP10 !== null && ndmiP10 < ANOMALY.ndmi_canopy_wet_max && level !== 'none') {
    const bump = { none: 'low', low: 'med', med: 'high', high: 'high' };
    level = bump[level];
  }
  return level;
}

function scoreHdb(cumulative) {
  const t = DISEASE_THRESHOLDS.hdb;
  if (cumulative.rh85_hours_72h >= t.rh72h_min_high && cumulative.heavy_rain_hours >= t.heavy_rain_hours_high) return 'high';
  if (cumulative.rh85_hours_72h >= t.rh72h_min_med && cumulative.heavy_rain_hours >= t.heavy_rain_hours_med) return 'med';
  if (cumulative.rh85_hours_72h >= 8) return 'low';
  return 'none';
}

function scoreWereng(cumulative) {
  const t = DISEASE_THRESHOLDS.wereng;
  if (cumulative.warm_humid_hours_7d >= t.warm_humid_hours_high) return 'high';
  if (cumulative.warm_humid_hours_7d >= t.warm_humid_hours_med) return 'med';
  if (cumulative.warm_humid_hours_7d >= 8) return 'low';
  return 'none';
}

function parseWeather(apiData) {
  const { time, temperature_2m, relative_humidity_2m, precipitation } = apiData.hourly;
  const nowUnix = Math.floor(Date.now() / 1000);
  let currentIdx = 0;
  for (let i = 0; i < time.length; i++) if (time[i] <= nowUnix) currentIdx = i;
  const startIdx = Math.max(0, currentIdx - 167);
  const cumulative = computeCumulativeMetrics(
    time,
    temperature_2m,
    relative_humidity_2m,
    precipitation,
    startIdx,
    currentIdx
  );
  let dailyRain7d = 0;
  for (let i = startIdx; i <= currentIdx; i++) dailyRain7d += precipitation[i] || 0;
  return { cumulative, dailyRain7d: +dailyRain7d.toFixed(1) };
}

export function OPTIONS() {
  return preflight();
}

export async function GET(request) {
  try {
    const q = getQuery(request);
    const id = kabupatenIdSchema.parse(q.kabupaten);
    const kab = getKabupaten(id);
    if (!kab) return fail(404, `kabupaten not found: ${id}`);

    const [lon, lat] = kab.centroid;
    let cumulative;
    let dailyRain7d;
    let weatherSource = 'open-meteo';
    try {
      const apiData = await fetchOpenMeteo(lat, lon);
      const parsed = parseWeather(apiData);
      cumulative = parsed.cumulative;
      dailyRain7d = parsed.dailyRain7d;
    } catch {
      weatherSource = 'dummy';
      cumulative = {
        rh85_hours_7d: 50, rh85_hours_72h: 22, blast_fav_hours: 18,
        blast_favorable_days: 2, high_humid_days: 4, hdb_rain_hours_7d: 30,
        heavy_rain_hours: 4, warm_humid_hours_7d: 60, max_consec_humid_hours: 12
      };
      dailyRain7d = 35;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const fromIso = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const ndmiSeries = dummyIndicesSeries(id, 'ndmi', fromIso, todayIso);
    const ndmiP10 = ndmiSeries.at(-1)?.p10 ?? null;

    const blast = scoreBlast(cumulative, dailyRain7d, ndmiP10);
    const hdb = scoreHdb(cumulative);
    const wereng = scoreWereng(cumulative);

    return ok(
      { kabupaten_id: id, cumulative, daily_rain_7d_mm: dailyRain7d, ndmi_p10: ndmiP10, risk: { blast, hdb, wereng } },
      {
        meta: { weather_source: weatherSource, satellite_source: 'dummy', kabupaten: kab.nama },
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=300' }
      }
    );
  } catch (err) {
    return fail(400, err);
  }
}
