import { QA_STATUS_LABEL, type QaStatus } from '@/lib/qa'

export function QaStatusBadge({ status }: { status: QaStatus }) {
  const cls = status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
  return <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${cls}`}>{QA_STATUS_LABEL[status]}</span>
}
