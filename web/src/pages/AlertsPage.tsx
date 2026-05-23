import { useState } from 'react';
import { useAlerts } from '@/hooks/useApi';
import AlertList from '@/components/AlertList';
import type { AlertSeverity, AlertType } from '@/lib/types';

const TYPES: Array<{ key: AlertType | 'all'; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'stress', label: 'Stres' },
  { key: 'flood', label: 'Banjir' },
  { key: 'drought', label: 'Kekeringan' },
  { key: 'disease_blast', label: 'Blast' },
  { key: 'disease_hdb', label: 'HDB' },
  { key: 'disease_wereng', label: 'Wereng' }
];

export default function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts();
  const [filterType, setFilterType] = useState<AlertType | 'all'>('all');
  const [filterSev, setFilterSev] = useState<AlertSeverity | 'all'>('all');

  const filtered = (alerts ?? []).filter(
    (a) => (filterType === 'all' || a.type === filterType) && (filterSev === 'all' || a.severity === filterSev)
  );

  return (
    <div className="h-full overflow-auto bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-2xl font-bold text-padi-400">⚠️ Peringatan</h1>

        <div className="mb-4 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilterType(t.key)}
              className={
                filterType === t.key
                  ? 'rounded bg-padi-700 px-3 py-1 text-xs text-white'
                  : 'rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          {(['all', 'high', 'med', 'low'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSev(s)}
              className={
                filterSev === s
                  ? 'rounded bg-padi-700 px-3 py-1 text-xs text-white'
                  : 'rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700'
              }
            >
              {s === 'all' ? 'Semua' : s.toUpperCase()}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-sm text-slate-500">Memuat...</div>
        ) : (
          <AlertList alerts={filtered} />
        )}
        <div className="mt-3 text-xs text-slate-500">{filtered.length} peringatan</div>
      </div>
    </div>
  );
}
