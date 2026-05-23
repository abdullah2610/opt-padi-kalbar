import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useKabupatenList } from '@/hooks/useKabupaten';
import { useMapStore } from '@/store/mapStore';
import { useIndicesSeries, useDiseaseRisk, useYield, useAlerts, useLandcover } from '@/hooks/useApi';
import IndexTimeseries from '@/components/IndexTimeseries';
import DiseaseRiskBadge from '@/components/DiseaseRiskBadge';
import YieldCard from '@/components/YieldCard';
import AlertList from '@/components/AlertList';
import LandcoverDonut from '@/components/LandcoverDonut';
import InfoTooltip from '@/components/InfoTooltip';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { kabupatenId } = useParams();
  const navigate = useNavigate();
  const { data: list } = useKabupatenList();
  const { activeIndex } = useMapStore();
  const kab = list?.find((k) => k.id === kabupatenId) ?? list?.[0];
  const activeId = kab?.id ?? null;

  useEffect(() => {
    if (!kabupatenId && kab) navigate(`/dashboard/${kab.id}`, { replace: true });
  }, [kabupatenId, kab, navigate]);

  const { data: indices } = useIndicesSeries(activeId, activeIndex);
  const { data: risk } = useDiseaseRisk(activeId);
  const { data: yieldEst } = useYield(activeId);
  const { data: alerts } = useAlerts(activeId);
  const { data: landcover } = useLandcover(activeId);

  if (!list) return <div className="flex h-full items-center justify-center text-slate-500">Memuat...</div>;

  return (
    <div className="h-full overflow-auto bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">{kab?.jenis === 'kota' ? 'Kota' : 'Kabupaten'}</div>
            <h1 className="text-2xl font-bold text-padi-400">{kab?.nama}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/panduan"
              className="rounded bg-slate-800 px-3 py-2 text-xs text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
            >
              📖 Panduan
            </Link>
            <select
              value={activeId ?? ''}
              onChange={(e) => navigate(`/dashboard/${e.target.value}`)}
              className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700"
            >
              {list.map((k) => (
                <option key={k.id} value={k.id}>{k.nama}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="mb-4 rounded border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
          <span className="text-padi-400">ℹ️</span> Cakupan: 14 kab/kota Kalbar. Resolusi 100m/pixel.
          Composite per 10-hari. <Link to="/panduan" className="text-padi-400 underline">Pelajari panduan baca data</Link>.
        </div>

        <section className="mb-4 rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              {activeIndex.toUpperCase()} — 180 hari terakhir
            </h2>
            <InfoTooltip title={`Indeks ${activeIndex.toUpperCase()}`}>
              <div>Time-series median (p50) + pita p10-p90.</div>
              <div className="text-slate-400">Tren naik = vegetasi tumbuh. Tren turun = panen/stress.</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Detail indeks →</Link>
            </InfoTooltip>
          </div>
          <div className="h-56">
            <IndexTimeseries data={indices ?? []} indexName={activeIndex} />
          </div>
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risiko Penyakit</h3>
            <InfoTooltip title="Risiko Penyakit">
              <div>Open-Meteo cuaca + NDMI satelit.</div>
              <div className="text-amber-300">Peluang, bukan kepastian.</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari →</Link>
            </InfoTooltip>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <DiseaseRiskBadge label="Blast" level={risk?.risk.blast ?? 'none'} />
            <DiseaseRiskBadge label="HDB" level={risk?.risk.hdb ?? 'none'} />
            <DiseaseRiskBadge label="Wereng" level={risk?.risk.wereng ?? 'none'} />
          </div>
        </section>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimasi Panen</h3>
              <InfoTooltip title="Estimasi Panen v0" align="left">
                <div>Regresi linear sederhana. Indikator, bukan ground truth.</div>
                <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari →</Link>
              </InfoTooltip>
            </div>
            <YieldCard estimate={yieldEst} />
          </div>
          <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tutupan lahan</h3>
              <InfoTooltip title="Tutupan Lahan" align="left">
                <div>ESA WorldCover 10m 2021.</div>
                <div className="text-slate-400">Cropland / hutan / water / urban.</div>
              </InfoTooltip>
            </div>
            <LandcoverDonut classes={landcover ?? []} />
          </div>
        </div>

        <section className="mb-4 rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Peringatan aktif</h3>
            <InfoTooltip title="Peringatan Otomatis">
              <div>Tipe: stress, drought, flood, disease.</div>
              <div className="text-slate-400">Severity: low / med / high.</div>
              <Link to="/panduan" className="mt-1 inline-block text-padi-400 underline">Pelajari →</Link>
            </InfoTooltip>
          </div>
          <AlertList alerts={alerts ?? []} />
        </section>
      </div>
    </div>
  );
}
