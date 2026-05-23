import { useState } from 'react';
import clsx from 'clsx';

type SectionId = 'umum' | 'peta' | 'dasbor' | 'indeks' | 'penyakit' | 'panen' | 'alert' | 'faq';

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'umum',     label: 'Pengantar',         icon: '📖' },
  { id: 'peta',     label: 'Tab Peta',          icon: '🗺️' },
  { id: 'dasbor',   label: 'Tab Dasbor',        icon: '📊' },
  { id: 'indeks',   label: 'Indeks Vegetasi',   icon: '🌱' },
  { id: 'penyakit', label: 'Risiko Penyakit',   icon: '🦠' },
  { id: 'panen',    label: 'Estimasi Panen',    icon: '🌾' },
  { id: 'alert',    label: 'Peringatan',        icon: '⚠️' },
  { id: 'faq',      label: 'FAQ',               icon: '❓' }
];

export default function HelpPage() {
  const [active, setActive] = useState<SectionId>('umum');

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200 md:flex-row">
      <nav className="border-b border-slate-800 bg-slate-900 md:w-56 md:border-b-0 md:border-r">
        <div className="flex overflow-x-auto p-2 md:flex-col md:gap-1 md:p-3">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={clsx(
                'whitespace-nowrap rounded px-3 py-2 text-left text-sm transition-colors',
                'md:flex md:items-center md:gap-2',
                active === s.id
                  ? 'bg-padi-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <span aria-hidden>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <article className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4 leading-relaxed">
          {active === 'umum' && <Umum />}
          {active === 'peta' && <Peta />}
          {active === 'dasbor' && <Dasbor />}
          {active === 'indeks' && <Indeks />}
          {active === 'penyakit' && <Penyakit />}
          {active === 'panen' && <Panen />}
          {active === 'alert' && <Alert />}
          {active === 'faq' && <FAQ />}
        </div>
      </article>
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-2 text-2xl font-bold text-padi-400">{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 mb-2 text-lg font-semibold text-padi-300">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-300">{children}</p>;
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-200">
      {children}
    </div>
  );
}
function Box({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-padi-400">{title}</div>
      <div className="space-y-1 text-sm text-slate-300">{children}</div>
    </div>
  );
}

function Umum() {
  return (
    <>
      <H1>📖 Pengantar SiPOPT Padi Kalbar</H1>
      <P>
        Aplikasi ini memantau kesehatan tanaman padi di <strong>14 kabupaten/kota Kalimantan Barat</strong> menggunakan
        citra satelit <strong>Sentinel-2 L2A</strong> dari European Space Agency (ESA) via Copernicus Data Space Ecosystem.
      </P>

      <H2>Cakupan Wilayah</H2>
      <Box title="Hanya 14 kabupaten/kota Kalbar">
        Sambas, Bengkayang, Landak, Mempawah, Sanggau, Ketapang, Sintang, Kapuas Hulu, Sekadau, Melawi,
        Kayong Utara, Kubu Raya, Kota Pontianak, Kota Singkawang.
        <br />
        <span className="text-xs text-slate-500">Provinsi lain di Indonesia belum tersedia di MVP ini.</span>
      </Box>

      <H2>Tingkat Detail (Resolusi)</H2>
      <P>
        Resolusi raster <strong>100 meter/pixel</strong> (downsampled dari native Sentinel-2 10 m untuk efisiensi storage).
        Setiap pixel = area ~1 hektar. Statistik (NDVI mean, p10, p90) dihitung kabupaten-level dari semua pixel valid.
      </P>
      <Note>
        <strong>Bukan plot-level monitoring.</strong> Pemantauan ini agregat kabupaten-level — tidak untuk
        identifikasi lahan individu petani. Untuk plot-level, perlu resolusi 10 m + survei lapang.
      </Note>

      <H2>Frekuensi Pembaruan</H2>
      <P>
        Composite Sentinel-2 dibuat per <strong>10 hari</strong> (median window). Tidak harian — terbatas oleh
        revisit satelit + filter awan (SCL mask kelas awan, bayangan, salju). Daerah Kalbar musim Sep-Apr
        sering tertutup awan → composite mungkin skip jika pixel valid &lt; 30%.
      </P>

      <H2>Sumber Data</H2>
      <ul className="ml-4 list-disc space-y-1 text-sm text-slate-300">
        <li><strong>Satelit:</strong> Sentinel-2 L2A (ESA Copernicus)</li>
        <li><strong>Cuaca:</strong> Open-Meteo (forecast + 7 hari historis)</li>
        <li><strong>Batas wilayah:</strong> BPS + OpenStreetMap</li>
        <li><strong>Referensi panen:</strong> BPS Statistik Pertanian (placeholder; data riil pending)</li>
      </ul>
    </>
  );
}

function Peta() {
  return (
    <>
      <H1>🗺️ Tab Peta</H1>
      <P>Tampilan utama — peta interaktif dengan overlay 14 kabupaten + raster indeks vegetasi.</P>

      <H2>Komponen Peta</H2>
      <Box title="Polygon kabupaten">
        Outline 14 wilayah dari data BPS. Tap polygon → buka bottom-sheet detail kabupaten.
      </Box>
      <Box title="Raster overlay (heatmap)">
        Tile PNG indeks vegetasi (NDVI/NDWI/MNDWI/NDMI/MSI/EVI) render on-the-fly via TiTiler.
        Warna gradient: <span className="text-red-400">merah</span> (rendah/stress) →
        <span className="text-amber-400"> kuning</span> (sedang) →
        <span className="text-emerald-400"> hijau</span> (tinggi/sehat).
        Hanya muncul kalau ETL untuk kabupaten itu sudah selesai (cek tanggal di slider).
      </Box>
      <Box title="LayerSwitcher (FAB kanan-bawah)">
        Ganti indeks aktif: NDVI (default — kesehatan), NDWI (air), MNDWI (banjir), NDMI (kelembaban kanopi),
        MSI (stress air), EVI (vegetasi rapat).
      </Box>
      <Box title="Date slider (bawah)">
        Pilih composite 10-hari. Default: terbaru. Geser ke kiri = window lebih lama (untuk lihat tren).
      </Box>

      <H2>Cara Membaca</H2>
      <ul className="ml-4 list-disc space-y-1 text-sm text-slate-300">
        <li>Polygon <strong>tanpa warna</strong> = belum ada data ETL untuk kabupaten itu.</li>
        <li>Heatmap <strong>seragam hijau</strong> = vegetasi sehat merata.</li>
        <li>Heatmap <strong>patchy/merah</strong> = ada area stress; drill-down via bottom-sheet untuk angka pasti.</li>
        <li>Heatmap <strong>kosong/transparan</strong> = composite belum di-render atau awan terlalu banyak.</li>
      </ul>
    </>
  );
}

function Dasbor() {
  return (
    <>
      <H1>📊 Tab Dasbor</H1>
      <P>Detail per-kabupaten dalam format card. Pilih kabupaten dari selector atas atau dari peta.</P>

      <H2>Card yang Ditampilkan</H2>
      <Box title="📈 Time-series indeks">
        Grafik garis NDVI (atau indeks aktif) selama 90-180 hari. Pita biru muda = p10-p90 (rentang
        variabilitas spatial dalam kabupaten). Garis tengah = median (p50).
        <br />
        <strong>Tren naik</strong> = pertumbuhan vegetasi (vegetatif/generatif).
        <strong> Tren turun</strong> = panen, drought, atau banjir.
      </Box>
      <Box title="🦠 Risiko Penyakit (3 badge)">
        Blast, HDB, Wereng. Level: Tidak ada / Rendah / Sedang / Tinggi. Lihat tab <em>Risiko Penyakit</em>.
      </Box>
      <Box title="🌾 Estimasi Panen">
        Prediksi ton produksi musim ini + ton/ha. Confidence rendah jika data BPS referensi belum lengkap.
        Lihat tab <em>Estimasi Panen</em>.
      </Box>
      <Box title="🍩 Tutupan Lahan">
        Donut chart distribusi class lahan (cropland, hutan, water, urban) dari ESA WorldCover 10m 2021.
        Pakai untuk konteks: % area sawah dari total kabupaten.
      </Box>
      <Box title="⚠️ Peringatan Aktif">
        List alert yang belum di-resolve. Detail di tab <em>Peringatan</em>.
      </Box>
    </>
  );
}

function Indeks() {
  return (
    <>
      <H1>🌱 Indeks Vegetasi Satelit</H1>
      <P>6 indeks dari kombinasi band Sentinel-2 (B02 biru, B03 hijau, B04 merah, B08 NIR, B11/B12 SWIR).</P>

      <Box title="NDVI — Normalized Difference Vegetation Index">
        Formula: <code className="text-padi-300">(NIR − Red) / (NIR + Red)</code>
        <br />
        Range: −1 sampai +1.
        <table className="mt-2 w-full text-xs">
          <tbody>
            <tr><td className="py-1 text-slate-400">&lt; 0.2</td><td>Tanah kosong / air / urban</td></tr>
            <tr><td className="py-1 text-slate-400">0.2 – 0.4</td><td>Vegetasi jarang / awal tanam</td></tr>
            <tr><td className="py-1 text-slate-400">0.4 – 0.6</td><td>Vegetasi sedang / vegetatif</td></tr>
            <tr><td className="py-1 text-slate-400">0.6 – 0.8</td><td>Vegetasi rapat / generatif (target padi sehat)</td></tr>
            <tr><td className="py-1 text-slate-400">&gt; 0.8</td><td>Sangat rapat (hutan)</td></tr>
          </tbody>
        </table>
        <span className="text-xs text-slate-500">Indeks utama untuk monitor kesehatan padi.</span>
      </Box>

      <Box title="NDWI — Normalized Difference Water Index">
        Formula: <code className="text-padi-300">(Green − NIR) / (Green + NIR)</code>
        <br />
        Range: −1 sampai +1. Positif = air permukaan terdeteksi. Untuk identifikasi sawah berair.
      </Box>

      <Box title="MNDWI — Modified NDWI (banjir detection)">
        Formula: <code className="text-padi-300">(Green − SWIR) / (Green + SWIR)</code>
        <br />
        Lebih sensitif dari NDWI untuk water bodies. <strong>MNDWI &gt; 0.3 di area cropland → suspect banjir.</strong>
      </Box>

      <Box title="NDMI — Normalized Difference Moisture Index (kelembaban kanopi)">
        Formula: <code className="text-padi-300">(NIR − SWIR1) / (NIR + SWIR1)</code>
        <br />
        Mengukur kandungan air dalam daun. <strong>NDMI &lt; 0.1 = kanopi kering</strong> → risiko blast naik.
      </Box>

      <Box title="MSI — Moisture Stress Index">
        Formula: <code className="text-padi-300">SWIR1 / NIR</code>
        <br />
        Kebalikan NDMI. <strong>MSI tinggi (&gt; 1.5)</strong> = vegetasi stress kering.
      </Box>

      <Box title="EVI — Enhanced Vegetation Index">
        Formula: <code className="text-padi-300">2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)</code>
        <br />
        Lebih akurat dari NDVI di area vegetasi rapat (tidak saturasi). Gunakan untuk monitor fase generatif penuh.
      </Box>

      <H2>Anomali Z-score</H2>
      <P>
        Setiap composite dibandingkan dengan <strong>baseline historical</strong> (mean ± std NDVI per Day-of-Year
        dari tahun 2019–2023). <strong>Z-score &lt; −1.5</strong> dua composite berturut-turut → alert <em>stress</em> otomatis.
      </P>
      <Note>
        <strong>Baseline 2019-2023 belum di-build.</strong> Z-score sementara NULL atau bias. Sedang dalam
        rencana baseline historis multi-tahun.
      </Note>
    </>
  );
}

function Penyakit() {
  return (
    <>
      <H1>🦠 Risiko Penyakit Padi</H1>
      <P>
        Gabungan model epidemiologi cuaca (Open-Meteo 7 hari historis + 3 hari forecast) + faktor satelit
        (NDMI canopy moisture).
      </P>

      <H2>3 Penyakit yang Dipantau</H2>
      <Box title="Blast (Pyricularia oryzae)">
        Jamur daun. Favorable: kelembaban tinggi (RH &gt; 85%) + suhu 22-28°C + kanopi basah malam hari.
        <br />
        <strong>NDMI &lt; 0.1 → boost level (+1)</strong> (kanopi kering ironi: jamur thrives di permukaan
        embun pada vegetasi padat).
      </Box>
      <Box title="HDB — Hawar Daun Bakteri (Xanthomonas oryzae)">
        Bakteri. Favorable: hujan deras + RH tinggi terus-menerus. Dihitung dari `heavy_rain_hours_7d` +
        `rh85_hours_7d`.
      </Box>
      <Box title="Wereng (Nilaparvata lugens) — proxy">
        Hama coklat. Favorable: panas + lembab + tanaman padi vegetatif rapat. Proxy dari
        `warm_humid_hours_7d` + NDVI.
      </Box>

      <H2>Level Risiko</H2>
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded bg-slate-800 p-2 text-center text-xs"><div className="font-bold">Tidak ada</div><div className="text-slate-500">Cuaca tidak mendukung</div></div>
        <div className="rounded bg-emerald-900/50 p-2 text-center text-xs text-emerald-300"><div className="font-bold">Rendah</div><div className="opacity-80">&lt; 24 jam fav.</div></div>
        <div className="rounded bg-amber-900/50 p-2 text-center text-xs text-amber-300"><div className="font-bold">Sedang</div><div className="opacity-80">24-72 jam fav.</div></div>
        <div className="rounded bg-red-900/60 p-2 text-center text-xs text-red-300"><div className="font-bold">Tinggi</div><div className="opacity-80">&gt; 72 jam fav.</div></div>
      </div>

      <Note>
        Risiko cuaca = <strong>peluang</strong>, bukan kepastian. Tetap perlu pengamatan lapang. Aplikasi
        fungisida/pestisida tanpa observasi visual tidak direkomendasikan.
      </Note>
    </>
  );
}

function Panen() {
  return (
    <>
      <H1>🌾 Estimasi Panen</H1>
      <P>
        Regresi linear sederhana (linreg-v0): <code className="text-padi-300">ton = a×NDVI_peak + b×area_sawah + c</code>
      </P>
      <P>
        Dilatih dari data BPS historical (ton produksi + hektar panen per tahun) join dengan NDVI peak per
        musim tanam dari composite Sentinel-2.
      </P>

      <H2>Cara Baca Card</H2>
      <Box title="Estimasi panen card">
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Ton estimated</strong> — total produksi musim aktif</li>
          <li><strong>Ton/ha</strong> — produktivitas; nilai sehat padi sawah Indonesia ~5-7 ton/ha</li>
          <li><strong>Area sawah</strong> — hektar dari BPS</li>
          <li><strong>Confidence</strong> — 0.0 sampai 0.95 (semakin tinggi semakin valid; rendah jika BPS data minim)</li>
        </ul>
      </Box>

      <Note>
        Model v0 = baseline minimum. Real-world akurat butuh fitur tambahan: EVI di fase grain-filling,
        umur tanaman dari LAI, cuaca total kumulatif, riwayat lahan. Treat sebagai indicator, bukan
        ground truth.
      </Note>
    </>
  );
}

function Alert() {
  return (
    <>
      <H1>⚠️ Peringatan / Alerts</H1>
      <P>Sistem deteksi otomatis berbasis trigger dari satelit + cuaca.</P>

      <H2>Tipe Alert</H2>
      <Box title="stress">
        NDVI z-score &lt; −1.5 selama 2 composite berturut-turut. Indikasi: drought, hama awal, atau
        kerusakan kanopi.
      </Box>
      <Box title="drought">
        NDVI z-score negatif + curah hujan 30 hari rendah + NDMI &lt; baseline.
      </Box>
      <Box title="flood">
        MNDWI &gt; 0.3 di area class "cropland". Area_ha banjir dicatat di payload.
      </Box>
      <Box title="disease">
        Cuaca favorable + NDMI rendah → trigger blast warning early.
      </Box>

      <H2>Severity</H2>
      <P>
        <strong>low</strong> = warning monitoring. <strong>med</strong> = perlu verifikasi lapang.
        <strong> high</strong> = aksi cepat (irigasi, fungisida, dll setelah konfirmasi visual).
      </P>

      <H2>Filter</H2>
      <P>
        Tab <em>Peringatan</em> punya filter by type + severity. Default sort by `started_at` desc.
        Alert resolved (`resolved_at` terisi) tidak ditampilkan default.
      </P>
    </>
  );
}

function FAQ() {
  return (
    <>
      <H1>❓ FAQ</H1>

      <H2>Mengapa hanya Kalimantan Barat?</H2>
      <P>
        MVP fokus 14 kabupaten Kalbar (~146.000 km²) — ETL Sentinel-2 dan database sudah disiapkan untuk
        cakupan ini. Ekspansi ke provinsi lain butuh GeoJSON batas + storage tambahan + run ETL ulang.
      </P>

      <H2>Mengapa kadang peta kosong/transparan?</H2>
      <P>
        Tiga kemungkinan: (1) ETL untuk kabupaten + tanggal itu belum jalan, (2) awan terlalu banyak
        (scl_clear_pct &lt; 30% → composite skipped), (3) TiTiler cold-start (refresh dalam 5 detik).
      </P>

      <H2>Seberapa akurat?</H2>
      <P>
        NDVI/NDWI/MNDWI/NDMI dari Sentinel-2 sudah validated peer-reviewed. Akurasi kabupaten-level (mean,
        p10, p90) tinggi. Estimasi panen + alert otomatis = indikator, perlu verifikasi lapang sebelum aksi.
      </P>

      <H2>Bisa dipakai offline?</H2>
      <P>
        Sebagian. App = PWA (install via Chrome Mobile → "Add to Home screen"). Service worker cache data
        kabupaten + tile yang sudah pernah dibuka. Data baru perlu online.
      </P>

      <H2>Data update kapan?</H2>
      <P>
        GitHub Actions cron jalan harian 02:00 UTC (09:00 WIB) untuk fetch composite Sentinel-2 terbaru
        (window last-10d). Tergantung quota CDSE + cuaca awan.
      </P>

      <H2>Bagaimana cara melaporkan data salah?</H2>
      <P>
        Buka GitHub issue di repo:
        <a href="https://github.com/abdullah2610/opt-padi-kalbar/issues" className="text-padi-400 underline">
          github.com/abdullah2610/opt-padi-kalbar/issues
        </a>
      </P>
    </>
  );
}
