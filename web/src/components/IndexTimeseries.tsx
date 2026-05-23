import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler, type ChartOptions
} from 'chart.js';
import type { IndexName, IndexPoint } from '@/lib/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface Props {
  data: IndexPoint[];
  indexName: IndexName;
}

export default function IndexTimeseries({ data, indexName }: Props) {
  if (!data.length) return <div className="text-xs text-slate-500">Belum ada data.</div>;

  const labels = data.map((d) => d.observation_date);
  const chartData = {
    labels,
    datasets: [
      {
        label: indexName.toUpperCase(),
        data: data.map((d) => d.mean),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2
      },
      {
        label: 'p10-p90',
        data: data.map((d) => d.p90),
        borderColor: 'rgba(34,197,94,0.3)',
        pointRadius: 0,
        borderDash: [3, 3]
      },
      {
        label: 'p10',
        data: data.map((d) => d.p10),
        borderColor: 'rgba(34,197,94,0.3)',
        pointRadius: 0,
        borderDash: [3, 3]
      }
    ]
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1 }
    },
    scales: {
      x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 20 }, grid: { display: false } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
    }
  };

  return (
    <div className="h-40">
      <Line data={chartData} options={options} />
    </div>
  );
}
