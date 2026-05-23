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
          <select
            value={activeId ?? ''}
            onChange={(e) => navigate(`/dashboard/${e.target.value}`)}
            className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700"
          >
            {list.map((k) => (
              <option key={k.id} value={k.id}>{k.nama}</option>
            ))}
          </select>
        </header>

        <section className="mb-4 rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {activeIndex.toUpperCase()} — 180 hari terakhir
          </h2>
          <div className="h-56">
            <IndexTimeseries data={indices ?? []} indexName={activeIndex} />
          </div>
        </section>

        <section className="mb-4 grid grid-cols-3 gap-3">
          <DiseaseRiskBadge label="Blast" level={risk?.risk.blast ?? 'none'} />
          <DiseaseRiskBadge label="HDB" level={risk?.risk.hdb ?? 'none'} />
          <DiseaseRiskBadge label="Wereng" level={risk?.risk.wereng ?? 'none'} />
        </section>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <YieldCard estimate={yieldEst} />
          <div className="rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tutupan lahan</h3>
            <LandcoverDonut classes={landcover ?? []} />
          </div>
        </div>

        <section className="mb-4 rounded-lg bg-slate-900 p-4 ring-1 ring-slate-800">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Peringatan aktif</h3>
          <AlertList alerts={alerts ?? []} />
        </section>
      </div>
    </div>
  );
}
