import { Store, Building2, FolderKanban, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AffiliationType } from '@/lib/affiliations'

// 仲間カードと同じ「アイコン＋色」スタイル。種別はアイコンと色で表す（文字ラベルは出さない）。
// 店舗=青 / 部署=紫 / PT(=PJチーム)=teal。shared（あなたと共通の所属）はベタ塗りで強調。
const TYPE_ICON: Record<AffiliationType, typeof Store> = { store: Store, department: Building2, project: FolderKanban }
const TYPE_NORMAL: Record<AffiliationType, string> = {
  store: 'bg-blue-50 text-blue-600',
  department: 'bg-purple-50 text-purple-600',
  project: 'bg-teal-50 text-teal-600',
}
const TYPE_SHARED: Record<AffiliationType, string> = {
  store: 'bg-blue-500 text-white',
  department: 'bg-purple-500 text-white',
  project: 'bg-teal-500 text-white',
}

/** 所属バッジ（店舗・部署・PT）。仲間カードと同じ見た目で、アプリ全体の所属表示に使う。 */
export function AffiliationBadge({
  type, name, leader = false, shared = false, className,
}: { type: AffiliationType; name: string; leader?: boolean; shared?: boolean; className?: string }) {
  const Icon = TYPE_ICON[type]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[9px] rounded px-1.5 py-0.5 font-medium max-w-[200px]',
        shared ? TYPE_SHARED[type] : TYPE_NORMAL[type],
        className,
      )}
      title={shared ? 'あなたと共通の所属' : undefined}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate">{name}</span>
      {leader && <Crown className="w-2.5 h-2.5 flex-shrink-0" />}
    </span>
  )
}
