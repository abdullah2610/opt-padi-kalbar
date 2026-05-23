import type { LandcoverClass } from '@/lib/types';

const COLOR: Record<string, string> = {
  tree_cover: '#006400',
  cropland: '#f096ff',
  built_up: '#fa0000',
  bare_sparse_veg: '#b4b4b4',
  permanent_water: '#0064c8',
  herbaceous_wet: '#0096a0',
  mangroves: '#00cf75',
  shrubland: '#ffbb22',
  grassland: '#ffff4c'
};

const LABEL: Record<string, string> = {
  tree_cover: 'Hutan',
  cropland: 'Sawah/lahan tanam',
  built_up: 'Pemukiman',
  bare_sparse_veg: 'Tanah terbuka',
  permanent_water: 'Air',
  herbaceous_wet: 'Lahan basah',
  mangroves: 'Mangrove',
  shrubland: 'Semak',
  grassland: 'Padang rumput'
};

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

export default function LandcoverDonut({ classes }: { classes: LandcoverClass[] }) {
  if (!classes.length) return <div className="text-xs text-slate-500">Belum ada data.</div>;

  const sorted = [...classes].sort((a, b) => b.area_pct - a.area_pct);
  let acc = 0;
  const segments = sorted.map((c) => {
    const start = acc;
    acc += c.area_pct;
    return { ...c, start, end: acc };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
        <circle cx="18" cy="18" r="14" fill="#0f172a" />
        {segments.map((s) => {
          const r = 14;
          const c = 2 * Math.PI * r;
          const dash = ((s.end - s.start) / 100) * c;
          const offset = (s.start / 100) * c;
          return (
            <circle
              key={s.class_code}
              cx="18"
              cy="18"
              r={r}
              fill="none"
              stroke={COLOR[s.class_name] ?? '#94a3b8'}
              strokeWidth="6"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <ul className="flex-1 space-y-0.5 text-[11px]">
        {sorted.slice(0, 6).map((c) => (
          <li key={c.class_code} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: COLOR[c.class_name] ?? '#94a3b8' }}
              />
              {LABEL[c.class_name] ?? c.class_name}
            </span>
            <span className="font-mono text-slate-400">{fmt.format(c.area_pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
