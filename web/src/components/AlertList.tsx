import type { Alert, AlertSeverity, AlertType } from '@/lib/types';
import clsx from 'clsx';

interface Props {
  alerts: Alert[];
  compact?: boolean;
}

const SEV_STYLE: Record<AlertSeverity, string> = {
  low: 'border-emerald-700 bg-emerald-900/30',
  med: 'border-amber-700 bg-amber-900/30',
  high: 'border-red-700 bg-red-900/30'
};

const TYPE_LABEL: Record<AlertType, string> = {
  stress: 'Stres tanaman',
  flood: 'Banjir',
  drought: 'Kekeringan',
  disease_blast: 'Penyakit Blast',
  disease_hdb: 'Penyakit HDB',
  disease_wereng: 'Hama Wereng',
  disease_bercak_coklat: 'Bercak Coklat'
};

const TYPE_ICON: Record<AlertType, string> = {
  stress: '🌱',
  flood: '🌊',
  drought: '☀️',
  disease_blast: '🦠',
  disease_hdb: '🦠',
  disease_wereng: '🐛',
  disease_bercak_coklat: '🍂'
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days === 0) return 'hari ini';
  if (days === 1) return 'kemarin';
  return `${days}h lalu`;
}

export default function AlertList({ alerts, compact = false }: Props) {
  if (!alerts.length)
    return <div className="text-xs text-slate-500">Tidak ada peringatan aktif.</div>;
  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={clsx(
            'flex items-center gap-3 rounded border-l-4 px-3 py-2',
            SEV_STYLE[a.severity]
          )}
        >
          <span aria-hidden className="text-xl">{TYPE_ICON[a.type]}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-100">{TYPE_LABEL[a.type]}</div>
            {!compact && (
              <div className="truncate text-xs text-slate-400">kab: {a.kabupaten_id}</div>
            )}
            <div className="text-[10px] text-slate-500">
              severity: {a.severity} • {relativeTime(a.started_at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
