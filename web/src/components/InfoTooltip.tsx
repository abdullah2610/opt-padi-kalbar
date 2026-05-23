import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface InfoTooltipProps {
  title?: string;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

/**
 * Info popover dengan icon ℹ️. Tap/click toggle. Tap-outside close.
 * Bekerja di mobile (tidak rely on hover).
 */
export default function InfoTooltip({ title, children, align = 'right', className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className={clsx('relative inline-block', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Informasi"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-padi-400"
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          className={clsx(
            'absolute z-50 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-xl',
            align === 'right' && 'right-0',
            align === 'left' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2'
          )}
        >
          {title && <div className="mb-1 font-semibold text-padi-400">{title}</div>}
          <div className="space-y-1 leading-snug">{children}</div>
        </div>
      )}
    </div>
  );
}
