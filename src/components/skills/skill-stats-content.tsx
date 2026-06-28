import { Progress } from '@/components/ui/progress'

export interface SkillStats {
  totalPct: number
  totalCertified: number
  totalSkills: number
  totalPending: number
  totalRejected: number
  totalUnapplied: number
  totalPendingPct: number
  /** 標準完了率（%）。0 のとき標準バーは出さない */
  standardPct: number
}

/**
 * ホームのウェルカムカードと同じ「数値＋実績/標準バー」（オレンジ背景・白文字）。
 * 並びは 認定済み → 申請中 → 差し戻し → 未申請。ホームとスキルページで共通利用。
 */
export function SkillStatsContent({
  totalPct, totalCertified, totalSkills, totalPending, totalRejected, totalUnapplied, totalPendingPct, standardPct,
}: SkillStats) {
  return (
    <>
      <div className="flex items-end gap-4">
        <div>
          <p className="text-orange-100 text-xs">全体達成率</p>
          <p className="text-4xl font-black">{totalPct}<span className="text-xl">%</span></p>
        </div>
        <div className="ml-3">
          <p className="text-orange-100 text-xs">認定済み</p>
          <p className="text-2xl font-bold">{totalCertified}<span className="text-base text-orange-100">/{totalSkills}</span></p>
        </div>
        <div className="ml-3">
          <p className="text-orange-100 text-xs">申請中</p>
          <p className="text-2xl font-bold">{totalPending}</p>
        </div>
        {totalRejected > 0 && (
          <div>
            <p className="text-red-200 text-xs">差し戻し</p>
            <p className="text-2xl font-bold text-red-200">{totalRejected}</p>
          </div>
        )}
        <div>
          <p className="text-orange-100 text-xs">未申請</p>
          <p className="text-2xl font-bold">{totalUnapplied}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-orange-100 w-7 text-right flex-shrink-0">実績</span>
          <div className="flex-1 h-2.5 bg-white/30 rounded-full overflow-hidden flex">
            <div className="h-full bg-white transition-all" style={{ width: `${totalPct}%` }} />
            {totalPendingPct > 0 && (
              <div className="h-full bg-yellow-300/70 transition-all" style={{ width: `${totalPendingPct}%` }} />
            )}
          </div>
          <span className="text-xs font-bold w-8 text-right flex-shrink-0">{totalPct}%</span>
        </div>
        {standardPct > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-orange-100 w-7 text-right flex-shrink-0">標準</span>
            <Progress value={standardPct} className="flex-1 h-2.5 bg-white/20 [&>div]:bg-white/50" />
            <span className="text-xs font-bold text-white/70 w-8 text-right flex-shrink-0">{standardPct}%</span>
          </div>
        )}
      </div>
    </>
  )
}
