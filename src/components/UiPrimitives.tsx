import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileWarning,
  Info,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-slate-200 mb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F2547]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  context,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  context?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'primary' | 'gold' | 'success' | 'warning';
}) {
  const iconColors: Record<string, string> = {
    default: 'text-[#0F2547] bg-slate-100',
    primary: 'text-[#1D4ED8] bg-blue-50',
    gold: 'text-[#9A6D1A] bg-[#FEF7E6]',
    success: 'text-emerald-700 bg-emerald-50',
    warning: 'text-amber-700 bg-amber-50',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A] tabular-nums">{value}</p>
        {context && <p className="mt-1.5 text-xs text-slate-500 truncate">{context}</p>}
      </div>
      <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${iconColors[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  );
}

export function StatusText({ status }: { status: string }) {
  const norm = status.toUpperCase();
  let color = 'text-slate-600';
  let Icon = Clock;
  let label = norm;

  if (norm === 'PUBLISHED' || norm === 'ACTIVE' || norm === 'VERIFIED' || norm === 'RESOLVED') {
    color = 'text-emerald-700';
    Icon = CheckCircle2;
  } else if (norm === 'APPROVED') {
    color = 'text-[#1D4ED8]';
    Icon = ShieldCheck;
  } else if (norm === 'SUBMITTED' || norm === 'IN_PROGRESS') {
    color = 'text-[#1D4ED8]';
    Icon = Clock;
  } else if (norm === 'RETURNED' || norm === 'MODERATE' || norm === 'ON_LEAVE') {
    color = 'text-amber-700';
    Icon = RotateCcw;
  } else if (norm === 'HIGH' || norm === 'WITHDRAWN' || norm === 'INACTIVE' || norm === 'INVALID') {
    color = 'text-rose-700';
    Icon = AlertCircle;
  } else if (norm === 'DRAFT' || norm === 'MONITOR') {
    color = 'text-slate-600';
    Icon = FileWarning;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label.replace(/_/g, ' ')}</span>
    </span>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="h-10 bg-slate-50 border-b border-slate-200" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="h-4 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Info,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-6 py-12 text-center">
      <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function FeedbackBanner({
  type,
  message,
  onClose,
}: {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose?: () => void;
}) {
  const styles =
    type === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : type === 'error'
        ? 'bg-rose-50 border-rose-200 text-rose-900'
        : 'bg-blue-50 border-blue-200 text-blue-900';

  return (
    <div className={`border rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3 ${styles}`}>
      <div className="flex items-center gap-2">
        {type === 'success' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : type === 'error' ? (
          <AlertCircle className="w-4 h-4 shrink-0" />
        ) : (
          <Info className="w-4 h-4 shrink-0" />
        )}
        <span>{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-black/5 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
