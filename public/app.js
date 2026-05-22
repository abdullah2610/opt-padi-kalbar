const API_BASE_URL = window.location.origin;
const WEATHER_REFRESH_MS = 300000;

const KALBAR_CITIES = [
  { name: 'Kota Pontianak',    lat: -0.0263, lon: 109.3425 },
  { name: 'Kota Singkawang',   lat:  0.9027, lon: 108.9776 },
  { name: 'Kab. Mempawah',     lat: -0.3667, lon: 108.9833 },
  { name: 'Kab. Sambas',       lat:  1.3667, lon: 109.3000 },
  { name: 'Kab. Bengkayang',   lat:  0.7333, lon: 109.3333 },
  { name: 'Kab. Landak',       lat:  0.3511, lon: 109.9682 },
  { name: 'Kab. Sanggau',      lat:  0.1300, lon: 110.5978 },
  { name: 'Kab. Sekadau',      lat: -0.0333, lon: 110.9500 },
  { name: 'Kab. Sintang',      lat:  0.0667, lon: 111.5000 },
  { name: 'Kab. Melawi',       lat: -0.5000, lon: 111.4667 },
  { name: 'Kab. Kapuas Hulu',  lat:  0.8667, lon: 113.9333 },
  { name: 'Kab. Ketapang',     lat: -1.8500, lon: 109.9833 },
  { name: 'Kab. Kayong Utara', lat: -1.0667, lon: 109.7333 },
  { name: 'Kab. Kubu Raya',    lat: -0.2667, lon: 109.5333 },
];

// State
let currentCityIndex = 0;
let lastWeatherUpdate = 0;
let weatherChart = null;
let rainChart = null;
let lastForecast = null;
let currentForecastDisease = 'all';
let weatherTimer = null;

// ── Utilities ────────────────────────────────────────────────────────────────

function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function mk(tag, cls, txt) {
  const e = document.createElement(tag);
  e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

// ── City Selector ────────────────────────────────────────────────────────────

function initCitySelector() {
  const sel = document.getElementById('city-selector');
  KALBAR_CITIES.forEach((city, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = city.name;
    if (i === currentCityIndex) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onCityChange() {
  const sel = document.getElementById('city-selector');
  currentCityIndex = parseInt(sel.value, 10);
  lastWeatherUpdate = 0;
  fetchAndRender();
}

// ── Disease Risk ─────────────────────────────────────────────────────────────

function calculateDiseaseRisks(suhu, rh, hujan7hari, cum) {
  const diseases = [];
  const blastFavDays   = cum?.blast_favorable_days  ?? 0;
  const blastFavHours  = cum?.blast_fav_hours       ?? 0;
  const humid80Days    = cum?.humid80_days           ?? 0;
  const rh85h72        = cum?.rh85_hours_72h         ?? 0;
  const rainHours7d    = cum?.hdb_rain_hours_7d      ?? 0;
  const warmHumidHours = cum?.warm_humid_hours_7d    ?? 0;
  const maxConsec      = cum?.max_consec_humid_hours ?? 0;
  const hasCum         = !!cum;

  // 1. Blast Padi
  if (hasCum) {
    if (blastFavDays >= 3 && hujan7hari >= 20) {
      diseases.push({ id:'blast', name:'Blast Padi', level:'TINGGI', icon:'🚨',
        detail:`${blastFavDays} hari favorable/7hr, hujan ${hujan7hari}mm/7hr`,
        cls:'bg-red-50 border-red-300 text-red-700' });
    } else if (blastFavHours >= 24 || maxConsec >= 10) {
      diseases.push({ id:'blast', name:'Blast Padi', level:'SEDANG', icon:'⚠️',
        detail:`${blastFavHours} jam kumulatif/7hr, maks ${maxConsec} jam berurutan`,
        cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'blast', name:'Blast Padi', level:'RENDAH', icon:'✅',
        detail:`${blastFavHours} jam favorable/7hr`,
        cls:'bg-green-50 border-green-300 text-green-700' });
    }
  } else {
    if (rh >= 85 && suhu >= 24 && suhu <= 28 && hujan7hari >= 20) {
      diseases.push({ id:'blast', name:'Blast Padi', level:'TINGGI', icon:'🚨',
        detail:`RH ${rh}%, suhu ${suhu}°C, hujan ${hujan7hari}mm/7hr`,
        cls:'bg-red-50 border-red-300 text-red-700' });
    } else if (rh >= 80 && suhu >= 23 && suhu <= 30) {
      diseases.push({ id:'blast', name:'Blast Padi', level:'SEDANG', icon:'⚠️',
        detail:`RH ${rh}%, suhu ${suhu}°C`, cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'blast', name:'Blast Padi', level:'RENDAH', icon:'✅',
        detail:'Kondisi tidak mendukung', cls:'bg-green-50 border-green-300 text-green-700' });
    }
  }

  // 2. Bercak Coklat
  if (hasCum) {
    if (humid80Days >= 3 && hujan7hari >= 15) {
      diseases.push({ id:'bercak', name:'Bercak Coklat', level:'SEDANG', icon:'⚠️',
        detail:`${humid80Days} hari RH≥80%/7hr, hujan ${hujan7hari}mm/7hr`,
        cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'bercak', name:'Bercak Coklat', level:'RENDAH', icon:'✅',
        detail:`${humid80Days} hari RH≥80%/7hr`,
        cls:'bg-green-50 border-green-300 text-green-700' });
    }
  } else {
    if (rh >= 85 && suhu >= 25 && suhu <= 35 && hujan7hari >= 15) {
      diseases.push({ id:'bercak', name:'Bercak Coklat', level:'SEDANG', icon:'⚠️',
        detail:`RH ${rh}%, hujan ${hujan7hari}mm/7hr`, cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'bercak', name:'Bercak Coklat', level:'RENDAH', icon:'✅',
        detail:'Kondisi tidak mendukung', cls:'bg-green-50 border-green-300 text-green-700' });
    }
  }

  // 3. Hawar Daun Bakteri
  if (hasCum) {
    if (rainHours7d >= 15 && rh85h72 >= 20) {
      diseases.push({ id:'hdb', name:'Hawar Daun Bakteri', level:'TINGGI', icon:'🚨',
        detail:`${rainHours7d} jam hujan/7hr, ${rh85h72} jam RH≥85%/72hr`,
        cls:'bg-red-50 border-red-300 text-red-700' });
    } else if (rainHours7d >= 8 && rh85h72 >= 10) {
      diseases.push({ id:'hdb', name:'Hawar Daun Bakteri', level:'SEDANG', icon:'⚠️',
        detail:`${rainHours7d} jam hujan/7hr, ${rh85h72} jam RH≥85%/72hr`,
        cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'hdb', name:'Hawar Daun Bakteri', level:'RENDAH', icon:'✅',
        detail:`${rainHours7d} jam hujan/7hr, ${rh85h72} jam RH≥85%/72hr`,
        cls:'bg-green-50 border-green-300 text-green-700' });
    }
  } else {
    if (rh >= 85 && suhu >= 25 && suhu <= 34 && hujan7hari >= 25) {
      diseases.push({ id:'hdb', name:'Hawar Daun Bakteri', level:'TINGGI', icon:'🚨',
        detail:`RH ${rh}%, hujan ${hujan7hari}mm/7hr`, cls:'bg-red-50 border-red-300 text-red-700' });
    } else if (rh >= 80 && suhu >= 25 && suhu <= 34 && hujan7hari >= 15) {
      diseases.push({ id:'hdb', name:'Hawar Daun Bakteri', level:'SEDANG', icon:'⚠️',
        detail:`RH ${rh}%, hujan ${hujan7hari}mm/7hr`, cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'hdb', name:'Hawar Daun Bakteri', level:'RENDAH', icon:'✅',
        detail:'Kondisi tidak mendukung', cls:'bg-green-50 border-green-300 text-green-700' });
    }
  }

  // 4. Wereng Coklat
  if (hasCum) {
    if (warmHumidHours >= 80 && hujan7hari < 60) {
      diseases.push({ id:'wereng', name:'Wereng Coklat', level:'TINGGI', icon:'🚨',
        detail:`${warmHumidHours} jam optimal/7hr, hujan ${hujan7hari}mm/7hr`,
        cls:'bg-red-50 border-red-300 text-red-700' });
    } else if (warmHumidHours >= 40 && hujan7hari < 80) {
      diseases.push({ id:'wereng', name:'Wereng Coklat', level:'SEDANG', icon:'⚠️',
        detail:`${warmHumidHours} jam optimal/7hr`, cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      const suppress = hujan7hari >= 80 ? `, ditekan hujan lebat (${hujan7hari}mm/7hr)` : '';
      diseases.push({ id:'wereng', name:'Wereng Coklat', level:'RENDAH', icon:'✅',
        detail:`${warmHumidHours} jam optimal/7hr${suppress}`,
        cls:'bg-green-50 border-green-300 text-green-700' });
    }
  } else {
    if (rh >= 85 && suhu >= 22 && suhu <= 30 && hujan7hari >= 5 && hujan7hari <= 35) {
      diseases.push({ id:'wereng', name:'Wereng Coklat', level:'TINGGI', icon:'🚨',
        detail:`RH ${rh}%, suhu ${suhu}°C`, cls:'bg-red-50 border-red-300 text-red-700' });
    } else if (rh >= 78 && suhu >= 22 && suhu <= 32 && hujan7hari < 40) {
      diseases.push({ id:'wereng', name:'Wereng Coklat', level:'SEDANG', icon:'⚠️',
        detail:`RH ${rh}%, suhu ${suhu}°C`, cls:'bg-yellow-50 border-yellow-300 text-yellow-700' });
    } else {
      diseases.push({ id:'wereng', name:'Wereng Coklat', level:'RENDAH', icon:'✅',
        detail:'Kondisi tidak mendukung', cls:'bg-green-50 border-green-300 text-green-700' });
    }
  }

  return diseases;
}

function getForecastRiskLevel(suhu_avg, rh_max, hujan7hari, disease) {
  switch (disease) {
    case 'blast':
      if (rh_max >= 85 && suhu_avg >= 24 && suhu_avg <= 28 && hujan7hari >= 20) return 'TINGGI';
      if (rh_max >= 80 && suhu_avg >= 23 && suhu_avg <= 30 && hujan7hari >= 10) return 'SEDANG';
      return 'RENDAH';
    case 'bercak':
      if (rh_max >= 85 && suhu_avg >= 25 && suhu_avg <= 35 && hujan7hari >= 20) return 'TINGGI';
      if (rh_max >= 80 && suhu_avg >= 25 && suhu_avg <= 35 && hujan7hari >= 15) return 'SEDANG';
      return 'RENDAH';
    case 'hdb':
      if (rh_max >= 85 && suhu_avg >= 25 && suhu_avg <= 34 && hujan7hari >= 25) return 'TINGGI';
      if (rh_max >= 80 && suhu_avg >= 25 && suhu_avg <= 34 && hujan7hari >= 15) return 'SEDANG';
      return 'RENDAH';
    case 'wereng':
      if (rh_max >= 85 && suhu_avg >= 22 && suhu_avg <= 30 && hujan7hari >= 5 && hujan7hari <= 35) return 'TINGGI';
      if (rh_max >= 78 && suhu_avg >= 22 && suhu_avg <= 32 && hujan7hari < 40) return 'SEDANG';
      return 'RENDAH';
    default: {
      const levels = ['blast','bercak','hdb','wereng'].map(d => getForecastRiskLevel(suhu_avg, rh_max, hujan7hari, d));
      if (levels.includes('TINGGI')) return 'TINGGI';
      if (levels.includes('SEDANG')) return 'SEDANG';
      return 'RENDAH';
    }
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

function getPressureInfo(hPa) {
  const v = parseFloat(hPa);
  if (!v || isNaN(v)) return { label: '--', color: 'text-gray-400' };
  if (v > 1015)  return { label: 'Cerah, stabil',           color: 'text-green-600' };
  if (v >= 1010) return { label: 'Normal, sedikit berawan', color: 'text-blue-500' };
  if (v >= 1000) return { label: 'Potensi hujan',            color: 'text-amber-500' };
  return            { label: 'Cuaca buruk / badai',           color: 'text-red-600' };
}

function updateWeatherCards(current) {
  document.getElementById('weather-suhu').textContent    = current.suhu;
  document.getElementById('weather-rh').textContent      = current.rh;
  document.getElementById('weather-tekanan').textContent = current.tekanan ?? '--';
  document.getElementById('weather-hujan').textContent   = current.hujan_7hari;
  const pi  = getPressureInfo(current.tekanan);
  const lbl = document.getElementById('weather-tekanan-label');
  lbl.textContent = pi.label;
  lbl.className   = `text-xs mt-1 font-medium ${pi.color}`;
  document.getElementById('weather-section').classList.remove('hidden');
}

function updateRiskSection(diseases) {
  const container = document.getElementById('risk-cards');
  clearChildren(container);
  diseases.forEach(d => {
    const card  = mk('div', `rounded-lg border px-3 py-2 flex items-center gap-2 ${d.cls}`);
    const icon  = mk('span', 'text-base flex-shrink-0', d.icon);
    const body  = mk('div', 'flex-1 min-w-0');
    const label = mk('div', 'font-semibold text-xs', `${d.name} — ${d.level}`);
    const det   = mk('div', 'text-xs opacity-75 truncate', d.detail);
    body.appendChild(label);
    body.appendChild(det);
    card.appendChild(icon);
    card.appendChild(body);
    container.appendChild(card);
  });
  document.getElementById('risk-section').classList.remove('hidden');
}

function showWeatherTab(tab) {
  document.getElementById('weather-chart-suhu-rh').classList.toggle('hidden', tab !== 'suhu-rh');
  document.getElementById('weather-chart-hujan').classList.toggle('hidden',   tab !== 'hujan');
  document.getElementById('wtab-suhu-rh').classList.toggle('active', tab === 'suhu-rh');
  document.getElementById('wtab-hujan').classList.toggle('active',   tab === 'hujan');
}

function updateWeatherChart(history) {
  const labels   = history.map(r => new Date(r.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }));
  const suhuData = history.map(r => r.suhu);
  const rhData   = history.map(r => r.rh);
  const ctx      = document.getElementById('weatherChart').getContext('2d');
  if (weatherChart) {
    weatherChart.data.labels = labels;
    weatherChart.data.datasets[0].data = suhuData;
    weatherChart.data.datasets[1].data = rhData;
    weatherChart.update();
  } else {
    weatherChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label:'Suhu (°C)', data:suhuData, borderColor:'rgb(239,68,68)',  backgroundColor:'rgba(239,68,68,0.08)',  tension:0.4, fill:false, pointRadius:2, yAxisID:'yLeft'  },
        { label:'RH (%)',    data:rhData,   borderColor:'rgb(59,130,246)', backgroundColor:'rgba(59,130,246,0.08)', tension:0.4, fill:false, pointRadius:2, yAxisID:'yRight' },
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
        scales: {
          yLeft:  { type:'linear', position:'left',  min:20, max:40,  ticks:{ callback:v => v+'°C', color:'rgb(239,68,68)',  font:{size:10} }, grid:{ color:'rgba(0,0,0,0.05)' } },
          yRight: { type:'linear', position:'right', min:40, max:100, ticks:{ callback:v => v+'%',  color:'rgb(59,130,246)', font:{size:10} }, grid:{ drawOnChartArea:false } },
          x: { ticks:{ maxRotation:45, minRotation:45, maxTicksLimit:8, font:{size:10} } },
        },
      },
    });
  }
  updateRainChart(history);
  document.getElementById('weather-chart-section').classList.remove('hidden');
}

function updateRainChart(history) {
  const labels = history.map(r => new Date(r.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }));
  const values = history.map(r => r.hujan_mm);
  const ctx    = document.getElementById('rainChart').getContext('2d');
  if (rainChart) {
    rainChart.data.labels = labels;
    rainChart.data.datasets[0].data = values;
    rainChart.update();
  } else {
    rainChart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Hujan (mm/jam)', data:values, backgroundColor:'rgba(59,130,246,0.6)', borderColor:'rgb(59,130,246)', borderWidth:1 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          y:{ beginAtZero:true, ticks:{ callback:v => v+'mm', font:{size:10} } },
          x:{ ticks:{ maxRotation:45, minRotation:45, maxTicksLimit:8, font:{size:10} } },
        },
      },
    });
  }
}

function changeForecastTab(disease) {
  currentForecastDisease = disease;
  ['all','blast','bercak','hdb','wereng'].forEach(id => {
    const btn = document.getElementById('ftab-' + id);
    if (btn) btn.classList.toggle('active', id === disease);
  });
  if (lastForecast) updateForecastSection(lastForecast);
}

function updateForecastSection(forecast) {
  if (!forecast || !forecast.length) return;
  lastForecast = forecast;
  const container = document.getElementById('forecast-scroll');
  clearChildren(container);

  const dayNames   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const riskColors = { TINGGI:'bg-red-50 border-red-400', SEDANG:'bg-yellow-50 border-yellow-400', RENDAH:'bg-green-50 border-green-400' };
  const riskIcons  = { TINGGI:'🚨', SEDANG:'⚠️', RENDAH:'🌿' };
  const riskText   = { TINGGI:'text-red-700', SEDANG:'text-yellow-700', RENDAH:'text-green-700' };

  forecast.forEach((day, i) => {
    const date    = new Date(day.date + 'T00:00:00');
    const suhuAvg = +((day.suhu_max + day.suhu_min) / 2).toFixed(0);
    const level   = getForecastRiskLevel(suhuAvg, day.rh_max, day.hujan_7hari, currentForecastDisease);
    const rainIcon = day.hujan > 8 ? '🌧️' : day.hujan > 1 ? '🌦️' : '☀️';
    const isToday  = i === 0;

    const card = mk('div', `flex-shrink-0 w-[68px] rounded-lg border-2 p-1.5 text-center ${riskColors[level]}${isToday ? ' ring-2 ring-green-500' : ''}`);
    card.title = `${day.date} — Risiko ${level}\nRH maks ${day.rh_max}%, Hujan 7hr ${day.hujan_7hari}mm`;
    card.appendChild(mk('div', 'text-xs font-bold text-gray-700 leading-tight', isToday ? 'Hari ini' : dayNames[date.getDay()]));
    card.appendChild(mk('div', 'text-xs text-gray-500', `${date.getDate()} ${monthNames[date.getMonth()]}`));
    card.appendChild(mk('div', 'text-lg my-0.5', rainIcon));
    card.appendChild(mk('div', 'text-xs font-semibold text-gray-800', `${day.suhu_max}°/${day.suhu_min}°`));
    card.appendChild(mk('div', 'text-xs text-gray-500', `${day.rh_max}%`));
    card.appendChild(mk('div', 'text-base mt-0.5', riskIcons[level]));
    card.appendChild(mk('div', `text-xs font-bold leading-tight ${riskText[level]}`, level));
    container.appendChild(card);
  });

  document.getElementById('forecast-section').classList.remove('hidden');
}

function toggleDiseaseInfo() {
  const panel = document.getElementById('disease-info-panel');
  const label = document.getElementById('info-toggle-label');
  const open  = panel.classList.toggle('hidden');
  label.textContent = open ? 'Cara hitung' : 'Tutup';
}

// ── Weather Fetch ─────────────────────────────────────────────────────────────

function showLoadError() {
  const section = document.getElementById('loading-section');
  clearChildren(section);
  section.classList.remove('pulse');
  const icon = mk('div', 'text-4xl mb-2', '⚠️');
  const msg  = mk('div', 'text-red-500 text-sm', 'Gagal memuat data. Coba lagi nanti.');
  section.appendChild(icon);
  section.appendChild(msg);
}

async function fetchAndRender() {
  try {
    const city = KALBAR_CITIES[currentCityIndex];
    const url  = `${API_BASE_URL}/api/weather?lat=${city.lat}&lon=${city.lon}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('loading-section').classList.add('hidden');
    updateWeatherCards(data.current);
    updateWeatherChart(data.history);
    const diseases = calculateDiseaseRisks(data.current.suhu, data.current.rh, data.current.hujan_7hari, data.cumulative);
    updateRiskSection(diseases);
    if (data.forecast) updateForecastSection(data.forecast);
    document.getElementById('weather-dummy-warning').classList.toggle('hidden', !data.isDummy);
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString('id-ID');
    lastWeatherUpdate = Date.now();
  } catch (err) {
    console.error('fetchAndRender error:', err);
    showLoadError();
  }
}

// ── Feedback Form ─────────────────────────────────────────────────────────────

let feedbackRating = 0;
const FEEDBACK_ENDPOINT = 'https://formspree.io/f/xnjrdyzk';
const RATING_LABELS = ['','Kurang','Cukup','Bermanfaat','Sangat Bermanfaat','Luar Biasa!'];

function renderStars(active) {
  document.querySelectorAll('.star-btn').forEach(btn => {
    const n = parseInt(btn.dataset.n, 10);
    btn.style.color     = n <= active ? '#f59e0b' : '#d1d5db';
    btn.style.transform = n <= active ? 'scale(1.15)' : 'scale(1)';
  });
}

function hoverRating(n) { renderStars(n || feedbackRating); }

function setRating(n) {
  feedbackRating = n;
  renderStars(n);
  const status = document.getElementById('feedback-status');
  status.textContent = RATING_LABELS[n] || '';
  status.className   = 'text-xs text-green-600 font-medium';
}

async function submitFeedback() {
  if (!feedbackRating) {
    const status = document.getElementById('feedback-status');
    status.textContent = 'Pilih bintang terlebih dahulu.';
    status.className   = 'text-xs text-red-500';
    return;
  }
  const text = document.getElementById('feedback-text').value.trim();
  const btn  = document.querySelector('#feedback-section button');
  btn.textContent = 'Mengirim...';
  btn.disabled    = true;

  try {
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        app:    'SiPOPT Padi — BRMP Kalimantan Barat',
        rating: `${feedbackRating}/5 — ${RATING_LABELS[feedbackRating]}`,
        kota:   KALBAR_CITIES[currentCityIndex].name,
        saran:  text || '(tidak ada saran)',
      }),
    });
    if (res.ok) {
      document.getElementById('feedback-section').classList.add('hidden');
      document.getElementById('feedback-thanks').classList.remove('hidden');
    } else {
      throw new Error('Non-OK');
    }
  } catch {
    btn.textContent = 'Kirim Masukan';
    btn.disabled    = false;
    const status = document.getElementById('feedback-status');
    status.textContent = 'Gagal kirim. Coba lagi.';
    status.className   = 'text-xs text-red-500';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  initCitySelector();
  fetchAndRender();
  weatherTimer = setInterval(() => {
    if (Date.now() - lastWeatherUpdate >= WEATHER_REFRESH_MS) fetchAndRender();
  }, 60000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
