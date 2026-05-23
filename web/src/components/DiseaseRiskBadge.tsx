import type { RiskLevel } from '@/lib/types';
import clsx from 'clsx';

interface Props {
  label: string;
  level: RiskLevel;
}

const STYLES: Record<RiskLevel, string> = {
  none: 'bg-slate-800 text-slate-400 ring-slate-700',
  low:  'bg-emerald-900/50 text-emerald-300 ring-emerald-700',
  med:  'bg-amber-900/50 text-amber-300 ring-amber-700',
  high: 'bg-red-900/60 text-red-300 ring-red-700'
};

const LABEL: Record<RiskLevel, string> = {
  none: 'Tidak ada',
  low:  'Rendah',
  med:  'Sedang',
  high: 'Tinggi'
};

export default function DiseaseRiskBadge({ label, level }: Props) {
  return (
    <div className={clsx('rounded-lg p-2 text-center ring-1', STYLES[level])}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-sm font-bold">{LABEL[level]}</div>
    </div>
  );
}
