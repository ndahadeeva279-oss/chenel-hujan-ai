import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

interface StatusLabelProps {
  status: string;
}

const STATUS_MAP: Record<
  string,
  { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  completed: { label: 'Selesai', colorClass: 'text-emerald-400', Icon: CheckCircle2 },
  published: { label: 'Dipublikasikan', colorClass: 'text-emerald-400', Icon: CheckCircle2 },
  approved_scheduled: { label: 'Disetujui & Terjadwal', colorClass: 'text-emerald-300', Icon: CheckCircle2 },
  processing: { label: 'Memproses', colorClass: 'text-emerald-300', Icon: Loader2 },
  running: { label: 'Berjalan', colorClass: 'text-emerald-300', Icon: Loader2 },
  uploading: { label: 'Mengunggah', colorClass: 'text-emerald-300', Icon: Loader2 },
  queued: { label: 'Dalam Antrean', colorClass: 'text-slate-300', Icon: Clock },
  draft: { label: 'Draf', colorClass: 'text-slate-400', Icon: Clock },
  waiting_approval: { label: 'Menunggu Persetujuan', colorClass: 'text-amber-300', Icon: AlertCircle },
  failed: { label: 'Gagal', colorClass: 'text-rose-400', Icon: XCircle },
  rejected: { label: 'Ditolak', colorClass: 'text-rose-400', Icon: XCircle },
};

export const StatusLabel: React.FC<StatusLabelProps> = ({ status }) => {
  const entry = STATUS_MAP[status] ?? { label: status, colorClass: 'text-slate-300', Icon: Clock };
  const Icon = entry.Icon;
  const spin = status === 'processing' || status === 'running' || status === 'uploading';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${entry.colorClass}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <span>{entry.label}</span>
    </span>
  );
};
