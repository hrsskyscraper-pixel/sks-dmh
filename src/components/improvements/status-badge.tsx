import { STATUS_LABEL, type ImprovementStatus } from '@/lib/improvements'
import { cn } from '@/lib/utils'

// ステータスごとの配色（提案の進行段階が一目で分かるように）
const STATUS_BADGE_CLASS: Record<ImprovementStatus, string> = {
  submitted: 'bg-amber-100 text-amber-700',
  ops_approved: 'bg-blue-100 text-blue-700',
  exec_approved: 'bg-blue-100 text-blue-700',
  in_development: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-gray-100 text-gray-600',
}

/** 改善提案のステータスバッジ（サーバー/クライアント両対応の純粋描画） */
export function ImprovementStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status as ImprovementStatus
  const label = STATUS_LABEL[s] ?? status
  const cls = STATUS_BADGE_CLASS[s] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={cn('inline-flex items-center text-[10px] font-medium rounded px-1.5 py-0.5', cls, className)}>
      {label}
    </span>
  )
}
