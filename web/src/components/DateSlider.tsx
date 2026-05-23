import { useEffect } from 'react';
import { useMapStore } from '@/store/mapStore';
import { useCompositeMeta } from '@/hooks/useApi';

export default function DateSlider() {
  const { selectedKabupatenId, compositeDate, setCompositeDate } = useMapStore();
  const { data: meta } = useCompositeMeta(selectedKabupatenId);

  useEffect(() => {
    if (meta && meta.length && !compositeDate) {
      setCompositeDate(meta[0].period_end);
    }
  }, [meta, compositeDate, setCompositeDate]);

  if (!selectedKabupatenId || !meta?.length) return null;

  const dates = meta.map((m) => m.period_end).reverse();
  const idx = Math.max(0, dates.indexOf(compositeDate ?? dates[dates.length - 1]));

  return (
    <div className="pointer-events-auto rounded-lg bg-slate-900/95 p-3 text-slate-100 shadow-lg ring-1 ring-slate-700 backdrop-blur">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">Tanggal composite</span>
        <span className="font-mono text-padi-400">{compositeDate ?? '—'}</span>
      </div>
      <input
        type="range"
        min={0}
        max={dates.length - 1}
        value={idx}
        onChange={(e) => setCompositeDate(dates[parseInt(e.target.value)])}
        className="w-full accent-padi-500"
      />
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}
