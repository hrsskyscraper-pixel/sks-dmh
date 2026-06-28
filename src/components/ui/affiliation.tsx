import { cn } from '@/lib/utils'
import {
  type AffiliationType,
  AFFILIATION_LABEL,
  AFFILIATION_BADGE_CLASS,
  AFFILIATION_DOT_CLASS,
  AFFILIATION_ORDER,
} from '@/lib/affiliations'

/**
 * 所属バッジ（店舗・部署・PT）。色だけで種別が分かるよう、タイプ名（店舗/部署/PT）は表示せず
 * 名称のみを色分けで表示する。種別の意味は近くに置く <AffiliationLegend /> で示す。
 */
export function AffiliationBadge({
  type, name, leader = false, className,
}: { type: AffiliationType; name: string; leader?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[9px] rounded px-1.5 py-px font-medium max-w-[180px]', AFFILIATION_BADGE_CLASS[type], className)}>
      <span className="truncate">{name}</span>
      {leader && <span aria-label="リーダー" title="リーダー">👑</span>}
    </span>
  )
}

/** 所属バッジの色分け凡例（店舗 / 部署 / PT）。表示エリアの上部に置く。 */
export function AffiliationLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 flex-wrap', className)}>
      {AFFILIATION_ORDER.map(t => (
        <span key={t} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <span className={cn('w-2.5 h-2.5 rounded-sm', AFFILIATION_DOT_CLASS[t])} />
          {AFFILIATION_LABEL[t]}
        </span>
      ))}
    </div>
  )
}
