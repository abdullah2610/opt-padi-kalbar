const DEFAULT_LAT = '-0.02';
const DEFAULT_LON = '109.34';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

function parseCoord(val, min, max, fallback) {
  const n = parseFloat(val);
  return Number.isFinite(n) && n >= min && n <= max ? n : parseFloat(fallback);
}

async function fetchFromOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude:      String(lat),
    longitude:     String(lon),
    hourly:        'temperature_2m,relative_humidity_2m,surface_pressure,precipitation',
    daily:         'temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max,wind_speed_10m_max',
    past_days:     '7',
    forecast_days: '14',
    timezone:      'Asia/Jakarta',
    timeformat:    'unixtime',
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

function computeCumulativeMetrics(time, temp, rh, rain, startIdx, currentIdx) {
  let rh85_hours_7d = 0, rh85_hours_72h = 0, blast_fav_hours = 0;
  let hdb_rain_hours_7d = 0, warm_humid_hours_7d = 0;
  let maxConsecHumid = 0, curConsecHumid = 0;
  const start72h = Math.max(startIdx, currentIdx - 71);
  const dayBuckets = {};

  for (let i = startIdx; i <= currentIdx; i++) {
    const r = rh[i], t = temp[i], p = rain[i] || 0;
    const dk = new Date(time[i] * 1000).toISOString().slice(0, 10);
    if (!dayBuckets[dk]) dayBuckets[dk] = { rh85: 0, blastFav: 0, humid80: 0 };

    if (r >= 85) {
      rh85_hours_7d++; curConsecHumid++;
      maxConsecHumid = Math.max(maxConsecHumid, curConsecHumid);
      dayBuckets[dk].rh85++;
    } else { curConsecHumid = 0; }
    if (r >= 80) dayBuckets[dk].humid80++;
    if (r >= 85 && t >= 24 && t <= 28) { blast_fav_hours++; dayBuckets[dk].blastFav++; }
    if (i >= start72h && r >= 85) rh85_hours_72h++;
    if (p > 1) hdb_rain_hours_7d++;
    if (r >= 78 && t >= 22 && t <= 32) warm_humid_hours_7d++;
  }

  return {
    blast_fav_hours,
    blast_favorable_days: Object.values(dayBuckets).filter(d => d.blastFav >= 8).length,
    high_humid_days:      Object.values(dayBuckets).filter(d => d.rh85    >= 8).length,
    humid80_days:         Object.values(dayBuckets).filter(d => d.humid80 >= 10).length,
    rh85_hours_72h,
    hdb_rain_hours_7d,
    warm_humid_hours_7d,
    max_consec_humid_hours: maxConsecHumid,
  };
}

function parseOpenMeteo(apiData) {
  const { time, temperature_2m, relative_humidity_2m, surface_pressure, precipitation } = apiData.hourly;
  const nowUnix = Math.floor(Date.now() / 1000);
  let currentIdx = 0;
  for (let i = 0; i < time.length; i++) { if (time[i] <= nowUnix) currentIdx = i; }

  const startIdx = Math.max(0, currentIdx - 23);
  const history = [];
  for (let i = startIdx; i <= currentIdx; i++) {
    history.push({
      suhu:      temperature_2m[i],
      rh:        relative_humidity_2m[i],
      tekanan:   surface_pressure ? +(surface_pressure[i]).toFixed(1) : null,
      hujan_mm:  +(precipitation[i]).toFixed(1),
      created_at: new Date(time[i] * 1000).toISOString(),
    });
  }

  let hujan7hari = 0;
  const rainStart = Math.max(0, currentIdx - 167);
  for (let i = rainStart; i <= currentIdx; i++) hujan7hari += precipitation[i] || 0;

  const cur = history[history.length - 1];
  const cumulative = computeCumulativeMetrics(time, temperature_2m, relative_humidity_2m, precipitation, rainStart, currentIdx);

  const d = apiData.daily;
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const todayUnix = Math.floor(todayMidnight.getTime() / 1000);
  const allDaily = d.time.map((t, i) => ({
    unix: t, hujan: d.precipitation_sum[i] || 0,
    rh_max: d.relative_humidity_2m_max[i],
    suhu_max: d.temperature_2m_max[i], suhu_min: d.temperature_2m_min[i],
  }));

  const forecast = [];
  for (let i = 0; i < allDaily.length && forecast.length < 14; i++) {
    if (allDaily[i].unix < todayUnix) continue;
    let rain7d = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) rain7d += allDaily[j].hujan;
    forecast.push({
      date: new Date(allDaily[i].unix * 1000).toISOString().slice(0, 10),
      suhu_max: allDaily[i].suhu_max, suhu_min: allDaily[i].suhu_min,
      rh_max: allDaily[i].rh_max, hujan: +allDaily[i].hujan.toFixed(1),
      hujan_7hari: +rain7d.toFixed(1),
    });
  }

  return {
    current: { suhu: cur.suhu, rh: cur.rh, tekanan: cur.tekanan, hujan_7hari: +hujan7hari.toFixed(1), created_at: cur.created_at },
    history, forecast, cumulative,
  };
}

// ── Dummy fallback ──────────────────────────────────────────────────────────

function seededRand(seed) { const x = Math.sin(seed + 1) * 10000; return x - Math.floor(x); }

function generateHourlyReading(date) {
  const hour = date.getHours();
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const seed = dayOfYear * 100 + hour;
  const suhu = +Math.max(23, Math.min(35, 28 + 4 * Math.sin((hour - 5) * 2 * Math.PI / 24) + (seededRand(seed) - 0.5) * 1.5)).toFixed(1);
  const rh = Math.round(Math.max(55, Math.min(98, 82 - 14 * Math.sin((hour - 5) * 2 * Math.PI / 24) + (seededRand(seed + 1) - 0.5) * 8)));
  const tekanan = +(1010 + Math.sin(dayOfYear * 0.5) * 3 + (seededRand(seed + 2) - 0.5) * 1.5).toFixed(1);
  const isRainyHour = seededRand(dayOfYear * 3) > 0.6 && hour >= 13 && hour <= 17;
  return { suhu, rh, tekanan, hujan_mm: isRainyHour ? +(seededRand(seed + 3) * 8 + 0.2).toFixed(1) : 0, created_at: date.toISOString() };
}

function generateDummyResponse() {
  const now = new Date();
  const hourly = { time: [], temp: [], rh: [], rain: [] };
  for (let i = 167; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000); d.setMinutes(0, 0, 0, 0);
    const r = generateHourlyReading(d);
    hourly.time.push(Math.floor(d.getTime() / 1000));
    hourly.temp.push(r.suhu); hourly.rh.push(r.rh); hourly.rain.push(r.hujan_mm);
  }
  const history = hourly.time.slice(-24).map((_, j) => {
    const i = hourly.time.length - 24 + j;
    return { suhu: hourly.temp[i], rh: hourly.rh[i], tekanan: null, hujan_mm: hourly.rain[i], created_at: new Date(hourly.time[i] * 1000).toISOString() };
  });
  let hujan7hari = 0; hourly.rain.forEach(r => { hujan7hari += r; });
  const cumulative = computeCumulativeMetrics(hourly.time, hourly.temp, hourly.rh, hourly.rain, 0, 167);

  const dailyBuffer = [];
  for (let i = -7; i < 14; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    const seed = dayOfYear * 100;
    const suhu_mid = 28 + (seededRand(seed) - 0.5) * 3;
    const isRainy = seededRand(dayOfYear * 3) > 0.55;
    dailyBuffer.push({
      suhu_max: +(suhu_mid + 3 + seededRand(seed + 5) * 2).toFixed(1),
      suhu_min: +(suhu_mid - 3 - seededRand(seed + 6) * 2).toFixed(1),
      rh_max: Math.round(Math.max(60, Math.min(98, 85 + (seededRand(seed + 7) - 0.5) * 15))),
      hujan: isRainy ? +(seededRand(seed + 8) * 20 + 1).toFixed(1) : 0,
    });
  }

  const forecast = [];
  for (let i = 0; i < 14; i++) {
    const buf = dailyBuffer[7 + i];
    let rain7d = 0;
    for (let j = Math.max(0, 7 + i - 6); j <= 7 + i; j++) rain7d += dailyBuffer[j].hujan;
    const date = new Date(now); date.setDate(date.getDate() + i);
    forecast.push({ date: date.toISOString().slice(0, 10), ...buf, hujan_7hari: +rain7d.toFixed(1) });
  }

  const cur = generateHourlyReading(now);
  return { current: { ...cur, hujan_7hari: +hujan7hari.toFixed(1) }, history, forecast, cumulative, isDummy: true };
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { lat: latParam, lon: lonParam } = req.query;
  const lat = parseCoord(latParam ?? DEFAULT_LAT, -90,  90,  DEFAULT_LAT);
  const lon = parseCoord(lonParam ?? DEFAULT_LON, -180, 180, DEFAULT_LON);

  try {
    const apiData = await fetchFromOpenMeteo(lat, lon);
    const { current, history, forecast, cumulative } = parseOpenMeteo(apiData);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ success: true, isDummy: false, lat, lon, current, history, forecast, cumulative });
  } catch (err) {
    console.error('Open-Meteo fetch failed, using dummy:', err.message);
    return res.status(200).json({ success: true, ...generateDummyResponse() });
  }
}
