import { useMapStore } from '@/store/mapStore';
import { useKabupatenList } from '@/hooks/useKabupaten';
import { useIndicesSeries, useDiseaseRisk, useYield, useAlerts, useLandcover } from '@/hooks/useApi';
import IndexTimeseries from './IndexTimeseries';
import DiseaseRiskBadge from './DiseaseRiskBadge';
import YieldCard from './YieldCard';
import AlertList from './AlertList';
import LandcoverDonut from './LandcoverDonut';

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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {activeIndex.toUpperCase()} time-series
          </h3>
          <IndexTimeseries data={indices ?? []} indexName={activeIndex} />
        </section>

        <section className="mb-4 grid grid-cols-3 gap-2">
          <DiseaseRiskBadge label="Blast" level={risk?.risk.blast ?? 'none'} />
          <DiseaseRiskBadge label="HDB" level={risk?.risk.hdb ?? 'none'} />
          <DiseaseRiskBadge label="Wereng" level={risk?.risk.wereng ?? 'none'} />
        </section>

        <section className="mb-4">
          <YieldCard estimate={yieldEst} />
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tutupan lahan</h3>
          <LandcoverDonut classes={landcover ?? []} />
        </section>

        <section className="mb-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Peringatan aktif</h3>
          <AlertList alerts={alerts ?? []} compact />
        </section>
      </div>
    </div>
  );
}
