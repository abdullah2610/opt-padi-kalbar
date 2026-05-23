import type { YieldEstimate } from '@/lib/types';

interface Props {
  estimate: YieldEstimate | undefined;
}

const fmtTon = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export default function YieldCard({ estimate }: Props) {
  if (!estimate) return <div className="text-xs text-slate-500">Belum ada estimasi.</div>;
  return (
    <div className="rounded-lg bg-slate-800/70 p-3 ring-1 ring-slate-700">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Estimasi panen {estimate.season}
        </h3>
        <span className="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
          conf {(estimate.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="text-2xl font-bold text-padi-400">
        {fmtTon.format(estimate.ton_estimated)} <span className="text-sm font-normal text-slate-400">ton</span>
      </div>
      <div className="text-xs text-slate-400">
        {fmtDec.format(estimate.ton_per_ha)} ton/ha • {fmtTon.format(estimate.area_sawah_ha)} ha sawah
      </div>
      <div className="mt-1 text-[10px] text-slate-500">model: {estimate.model_version}</div>
    </div>
  );
}
