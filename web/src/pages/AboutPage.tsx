export default function AboutPage() {
  return (
    <div className="h-full overflow-auto bg-slate-900 p-6">
      <h1 className="mb-4 text-xl font-bold text-padi-400">ℹ️ Tentang</h1>
      <div className="prose prose-invert max-w-prose space-y-3 text-sm text-slate-300">
        <p>
          <strong>Opt Padi Kalbar</strong> memantau kesehatan tanaman padi di 14 kabupaten/kota
          Kalimantan Barat menggunakan citra <strong>Sentinel-2 L2A</strong> via Copernicus Data
          Space Ecosystem.
        </p>
        <p>Indeks yang dihitung: NDVI, NDWI, MNDWI, NDMI, MSI, EVI.</p>
        <p>
          Data cuaca dari <a href="https://open-meteo.com" className="text-padi-400 underline">Open-Meteo</a>.
          Batas kabupaten dari OpenStreetMap & BPS.
        </p>
        <p className="text-xs text-slate-500">Versi 0.1.0 — MVP, public read-only.</p>
      </div>
    </div>
  );
}
