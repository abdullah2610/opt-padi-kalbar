import { useMapStore } from '@/store/mapStore';
import type { IndexName } from '@/lib/types';
import clsx from 'clsx';

const OPTIONS: Array<{ key: IndexName; label: string; desc: string }> = [
  { key: 'ndvi',  label: 'NDVI',  desc: 'Vigor' },
  { key: 'ndwi',  label: 'NDWI',  desc: 'Vegetation water' },
  { key: 'mndwi', label: 'MNDWI', desc: 'Air/banjir' },
  { key: 'ndmi',  label: 'NDMI',  desc: 'Kelembaban' },
  { key: 'msi',   label: 'MSI',   desc: 'Stres air' },
  { key: 'evi',   label: 'EVI',   desc: 'Biomass' }
];

export default function LayerSwitcher() {
  const { activeIndex, setActiveIndex } = useMapStore();
  return (
    <div className="pointer-events-auto rounded-lg bg-slate-900/95 p-2 text-slate-100 shadow-lg ring-1 ring-slate-700 backdrop-blur">
      <div className="px-1 pb-1 text-xs font-semibold text-slate-400">Indeks</div>
      <div className="grid grid-cols-3 gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => setActiveIndex(o.key)}
            className={clsx(
              'rounded px-2 py-1 text-left text-xs transition-colors',
              activeIndex === o.key
                ? 'bg-padi-700 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            )}
          >
            <div className="font-semibold">{o.label}</div>
            <div className="text-[10px] text-slate-400">{o.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
