import { useMapStore } from '@/store/mapStore';
import { useKabupatenList } from '@/hooks/useKabupaten';
import { useIndicesSeries, useDiseaseRisk, useYield, useAlerts, useLandcover } from '@/hooks/useApi';
import IndexTimeseries from './IndexTimeseries';
import DiseaseRiskBadge from './DiseaseRiskBadge';
import YieldCard from './YieldCard';
import AlertList from './AlertList';
import LandcoverDonut from './LandcoverDonut';
import InfoTooltip from './InfoTooltip';
import { Link } from 'react-router-dom';

const INDEX_INFO: Record<string, { title: string; desc: string; range: string }> = {
  ndvi:  { title: 'NDVI',  desc: 'Normalized Difference Vegetation Index. Kesehatan vegetasi.',         range: '<0.2 tanah / 0.4-0.6 vegetatif / >0.6 sehat' },
  ndwi:  { title: 'NDWI',  desc: 'Normalized Difference Water Index. Air permukaan.',                   range: '> 0 = air terdeteksi' },
  mndwi: { title: 'MNDWI', desc: 'Modified NDWI. Sensitif untuk identifikasi banjir.',                  range: '>0.3 di cropland = suspect banjir' },
  ndmi:  { title: 'NDMI',  desc: 'Kelembaban kanopi (canopy moisture).',                                range: '<0.1 = kanopi kering → risk blast' },
  msi:   { title: 'MSI',   desc: 'Moisture Stress Index. Kebalikan NDMI.',                              range: '>1.5 = vegetasi stress kering' },
  evi:   { title: 'EVI',   desc: 'Enhanced Vegetation Index. Akurat di vegetasi rapat.',                range: 'Tidak saturasi seperti NDVI' }
};

export default function KabupatenSheet() {
  const { selectedKabupatenId, activeIndex, bottomSheetOpen, setBottomSheetOpen } = useMapStore();
  const { data: list } = useKabupatenList();
  const kab = list?.find((k) => k.id === selectedKabupatenId);
  const { data: indices } = useIndicesSeries(selectedKabupatenId, activeIndex);
  const { data: risk } = useDiseaseRisk(selectedKabupatenId);
  const { data: yieldEst } = useYield(selectedKabupatenId);
  const { data: alerts } = useAlerts(selectedKabupatenId);
  const { data: landcover } = useLandcover(selectedKabupatenId);

  if (!selectedKabupatenId || !kab) return null;

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-slate-900 text-slate-100 shadow-2xl ring-1 ring-slate-700 transition-transform md:inset-y-0 md:right-0 md:left-auto md:max-w-md md:rounded-l-2xl md:rounded-t-none ${
        bottomSheetOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-[80%] md:translate-x-[80%]'
      }`}
      style={{ maxHeight: '80vh' }}
    >
      <button
        onClick={() => setBottomSheetOpen(!bottomSheetOpen)}
        className="flex w-full items-center justify-between rounded-t-2xl border-b border-slate-800 px-4 py-3 md:rounded-tr-none"
      >
        <div className="text-left">
          <div className="text-xs text-slate-500">{kab.jenis === 'kota' ? 'Kota' : 'Kabupaten'}</div>
          <div className="text-lg font-bold text-padi-400">{kab.nama}</div>
        </div>
        <div className="text-2xl text-slate-500">{bottomSheetOpen ? '▾' : '▴'}</div>
      </button>

      <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(80vh - 60px)' }}>
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {activeIndex.toUpperCase()} time-series
            </h3>
            <InfoTooltip title={INDEX_INFO[activeIndex]?.title ?? activeIndex.toUpperCase()}>
              <div>{INDEX_INFO[activeIndex]?.desc}</div>
              <div className="text-slate-400">Rentang: {INDEX_INFO[activeIndex]?.range}</div>
              <div className="mt-1 text-slate-500">Pita biru = p10-p90, garis = median (p50).</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari lebih lanjut →</Link>
            </InfoTooltip>
          </div>
          <IndexTimeseries data={indices ?? []} indexName={activeIndex} />
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risiko Penyakit</h3>
            <InfoTooltip title="Risiko Penyakit Padi">
              <div>Gabungan cuaca (Open-Meteo) + NDMI satelit.</div>
              <div className="text-slate-400">Level dari favorable hours: Rendah (&lt;24h), Sedang (24-72h), Tinggi (&gt;72h).</div>
              <div className="text-amber-300">Peluang, bukan kepastian — perlu observasi lapang.</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari lebih lanjut →</Link>
            </InfoTooltip>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <DiseaseRiskBadge label="Blast" level={risk?.risk.blast ?? 'none'} />
            <DiseaseRiskBadge label="HDB" level={risk?.risk.hdb ?? 'none'} />
            <DiseaseRiskBadge label="Wereng" level={risk?.risk.wereng ?? 'none'} />
          </div>
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimasi Panen</h3>
            <InfoTooltip title="Estimasi Panen v0">
              <div>Regresi linear: ton = a×NDVI_peak + b×area + c.</div>
              <div className="text-slate-400">Dilatih dari BPS + NDVI peak per musim.</div>
              <div className="text-amber-300">Model v0 = indikator, bukan ground truth.</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari lebih lanjut →</Link>
            </InfoTooltip>
          </div>
          <YieldCard estimate={yieldEst} />
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tutupan lahan</h3>
            <InfoTooltip title="Tutupan Lahan">
              <div>Distribusi class dari ESA WorldCover 10m 2021.</div>
              <div className="text-slate-400">Class: cropland, hutan, water, urban, dll.</div>
              <div className="text-slate-500">Konteks: % area sawah dari total kabupaten.</div>
            </InfoTooltip>
          </div>
          <LandcoverDonut classes={landcover ?? []} />
        </section>

        <section className="mb-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Peringatan aktif</h3>
            <InfoTooltip title="Peringatan Otomatis">
              <div>Trigger dari satelit + cuaca.</div>
              <div className="text-slate-400">Tipe: stress, drought, flood, disease.</div>
              <div className="text-slate-400">Severity: low / med / high.</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari lebih lanjut →</Link>
            </InfoTooltip>
          </div>
          <AlertList alerts={alerts ?? []} compact />
        </section>
      </div>
    </div>
  );
}
