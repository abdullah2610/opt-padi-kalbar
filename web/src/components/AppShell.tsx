import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { to: '/peta', label: 'Peta', icon: '🗺️' },
  { to: '/dashboard', label: 'Dasbor', icon: '📊' },
  { to: '/alerts', label: 'Peringatan', icon: '⚠️' },
  { to: '/tentang', label: 'Tentang', icon: 'ℹ️' }
];

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-slate-950 md:flex-row">
      <aside className="hidden border-r border-slate-800 bg-slate-900 md:flex md:w-56 md:flex-col">
        <div className="p-4 text-padi-400">
          <div className="text-lg font-bold">🌾 Padi Kalbar</div>
          <div className="text-xs text-slate-500">Sentinel-2 monitoring</div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-padi-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )
              }
            >
              <span aria-hidden>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="relative flex-1 overflow-hidden">{children}</main>

      <nav className="safe-bottom flex border-t border-slate-800 bg-slate-900 md:hidden">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs',
                isActive ? 'text-padi-400' : 'text-slate-400'
              )
            }
          >
            <span aria-hidden className="text-lg">
              {icon}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
