'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { Store, Building2, FolderKanban, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AffiliationBadge } from '@/components/ui/affiliation'
import { RankingList } from '@/components/dashboard/ranking-list'
import type { RankingDataset, RankRowMeta, AffType } from '@/lib/ranking-data'
import type { RankEntry } from '@/lib/skill-ranking'

const PAGE = 50
const MEDALS = ['🥇', '🥈', '🥉']
const AFF_ICON: Record<AffType, typeof Store> = { store: Store, department: Building2, project: FolderKanban }
const AFF_CIRCLE: Record<AffType, string> = {
  store: 'bg-blue-100 text-blue-600',
  department: 'bg-purple-100 text-purple-600',
  project: 'bg-teal-100 text-teal-600',
}

type Mode = 'period' | 'compare'
type Axis = 'personal' | 'affiliation'

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
            value === o.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 期間内（個人別/所属別）の棒グラフ付きリスト。所属別は所属バッジ、個人別は RankingList を流用 */
function AffiliationRows({ rows, max }: { rows: { meta: RankRowMeta; count: number }[]; max: number }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const pct = max > 0 ? Math.round((r.count / max) * 100) : 0
        const Icon = AFF_ICON[r.meta.affType ?? 'project']
        return (
          <div
            key={r.meta.id}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
            style={{ background: `linear-gradient(to right, rgba(251,146,60,0.32) ${pct}%, rgba(243,244,246,0.8) ${pct}%)` }}
          >
            <span className="w-6 text-center text-sm font-bold text-gray-500 flex-shrink-0">{MEDALS[i] ?? i + 1}</span>
            <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', AFF_CIRCLE[r.meta.affType ?? 'project'])}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 truncate">{r.meta.name}</p>
            </div>
            <span className="text-sm font-black text-orange-600 flex-shrink-0">{r.count}<span className="text-[10px] font-normal text-gray-400 ml-0.5">個</span></span>
          </div>
        )
      })}
    </div>
  )
}

/** 前月対比（個人別/所属別）。増減数・率を色付きで、棒は増減の大きさを表す */
function CompareRows({ rows, maxAbs, isAffiliation }: { rows: { meta: RankRowMeta; count: number; prev: number; delta: number }[]; maxAbs: number; isAffiliation: boolean }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const up = r.delta > 0, down = r.delta < 0
        const pct = maxAbs > 0 ? Math.round((Math.abs(r.delta) / maxAbs) * 100) : 0
        const fill = up ? 'rgba(34,197,94,0.22)' : down ? 'rgba(239,68,68,0.20)' : 'rgba(243,244,246,0.8)'
        const rate = r.prev > 0 ? `${up ? '+' : ''}${Math.round((r.delta / r.prev) * 100)}%` : (r.count > 0 ? '新規' : '—')
        const isAff = isAffiliation
        const Icon = AFF_ICON[r.meta.affType ?? 'project']
        return (
          <div
            key={r.meta.id}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
            style={{ background: `linear-gradient(to right, ${fill} ${pct}%, rgba(243,244,246,0.8) ${pct}%)` }}
          >
            <span className="w-6 text-center text-sm font-bold text-gray-500 flex-shrink-0">{i + 1}</span>
            {isAff ? (
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', AFF_CIRCLE[r.meta.affType ?? 'project'])}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            ) : (
              <Avatar className="w-7 h-7 flex-shrink-0">
                <AvatarImage src={r.meta.avatarUrl ?? undefined} />
                <AvatarFallback className="text-[10px] font-bold bg-gray-200 text-gray-500">{r.meta.name.charAt(0)}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 truncate">{r.meta.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {!isAff && r.meta.affName && r.meta.affType && <AffiliationBadge type={r.meta.affType} name={r.meta.affName} />}
                <span className="text-[9px] text-gray-400">前月 {r.prev} → 当月 {r.count}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={cn('flex items-center text-sm font-black', up ? 'text-green-600' : down ? 'text-red-500' : 'text-gray-400')}>
                {up ? <ArrowUp className="w-3.5 h-3.5" /> : down ? <ArrowDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                {Math.abs(r.delta)}
              </span>
              <span className={cn('text-[10px] w-10 text-right', up ? 'text-green-600' : down ? 'text-red-500' : 'text-gray-400')}>{rate}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function RankingExplorer({ dataset, currentEmployeeId }: { dataset: RankingDataset; currentEmployeeId?: string }) {
  const [mode, setMode] = useState<Mode>('period')
  const [axis, setAxis] = useState<Axis>('personal')
  const [periodKey, setPeriodKey] = useState(dataset.periods[0]?.key ?? 'last30')
  // 当月は進行中で対比が低く出るため、既定は直近の完了月（前月）を選ぶ
  const [compareKey, setCompareKey] = useState(dataset.comparePeriods[1]?.key ?? dataset.comparePeriods[0]?.key ?? '')
  const hasCompare = dataset.comparePeriods.length > 0

  // ビュー切替でページングをリセット（レンダー中に調整＝effect不要）
  const viewKey = `${mode}:${axis}:${mode === 'period' ? periodKey : compareKey}`
  const [prevView, setPrevView] = useState(viewKey)
  const [visible, setVisible] = useState(PAGE)
  if (viewKey !== prevView) { setPrevView(viewKey); setVisible(PAGE) }

  const periodRows = useMemo(() => {
    if (mode !== 'period') return []
    const metas = axis === 'personal' ? dataset.personalMeta : dataset.affiliationMeta
    const counts = axis === 'personal' ? dataset.empCount[periodKey] : dataset.affCount[periodKey]
    const toISO = dataset.periods.find(p => p.key === periodKey)?.toISO ?? null
    let rows = metas.map(meta => ({ meta, count: counts?.[meta.id] ?? 0 }))
    if (axis === 'personal' && toISO) rows = rows.filter(r => !r.meta.joinDate || r.meta.joinDate < toISO)
    rows.sort((a, b) => b.count - a.count || a.meta.name.localeCompare(b.meta.name, 'ja'))
    return rows
  }, [mode, axis, periodKey, dataset])

  const compareRows = useMemo(() => {
    if (mode !== 'compare') return []
    const cdef = dataset.comparePeriods.find(c => c.key === compareKey)
    if (!cdef) return []
    const cur = axis === 'personal' ? dataset.empCount[cdef.key] : dataset.affCount[cdef.key]
    const prev = axis === 'personal' ? dataset.empCount[cdef.prevKey] : dataset.affCount[cdef.prevKey]
    const metas = axis === 'personal' ? dataset.personalMeta : dataset.affiliationMeta
    return metas
      .map(meta => { const c = cur?.[meta.id] ?? 0, p = prev?.[meta.id] ?? 0; return { meta, count: c, prev: p, delta: c - p } })
      .filter(r => r.count > 0 || r.prev > 0)
      .sort((a, b) => b.delta - a.delta || b.count - a.count || a.meta.name.localeCompare(b.meta.name, 'ja'))
  }, [mode, axis, compareKey, dataset])

  const total = mode === 'period' ? periodRows.length : compareRows.length

  // 無限スクロール
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || visible >= total) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(v => Math.min(v + PAGE, total)) }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible, total])

  const periodLabel = mode === 'period'
    ? dataset.periods.find(p => p.key === periodKey)?.label ?? ''
    : dataset.comparePeriods.find(c => c.key === compareKey)?.label ?? ''
  const certifiedCount = mode === 'period' ? periodRows.filter(r => r.count > 0).length : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Seg<Mode>
          value={mode}
          onChange={setMode}
          options={hasCompare ? [{ key: 'period', label: '期間内ランキング' }, { key: 'compare', label: '前月対比' }] : [{ key: 'period', label: '期間内ランキング' }]}
        />
        <Seg<Axis> value={axis} onChange={setAxis} options={[{ key: 'personal', label: '個人別' }, { key: 'affiliation', label: '所属別' }]} />
      </div>

      {/* 期間チップ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {(mode === 'period' ? dataset.periods : dataset.comparePeriods).map(p => {
          const active = (mode === 'period' ? periodKey : compareKey) === p.key
          return (
            <button
              key={p.key}
              onClick={() => (mode === 'period' ? setPeriodKey(p.key) : setCompareKey(p.key))}
              className={cn(
                'whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                active ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        {mode === 'period'
          ? (axis === 'personal'
              ? `${periodLabel}・全メンバー${total}名（うち認定あり${certifiedCount}名）の認定数`
              : `${periodLabel}・所属${total}件の認定数（所属メンバーの合算）`)
          : (axis === 'personal'
              ? `${periodLabel}の前月対比・スキル習得数の増減（${total}名）`
              : `${periodLabel}の前月対比・スキル習得数の増減（所属${total}件）`)}
      </p>

      {total === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">該当するデータがありません</p>
      ) : mode === 'period' ? (
        axis === 'personal' ? (
          <RankingList
            ranking={periodRows.slice(0, visible).map(r => ({
              employeeId: r.meta.id,
              name: r.meta.name,
              avatarUrl: r.meta.avatarUrl,
              joinDate: r.meta.joinDate,
              store: r.meta.affName,
              affType: r.meta.affType,
              curricula: r.meta.curricula,
              count: r.count,
              breakdown: dataset.empBreakdown[periodKey]?.[r.meta.id] ?? [],
            } satisfies RankEntry))}
            currentEmployeeId={currentEmployeeId}
          />
        ) : (
          <AffiliationRows rows={periodRows.slice(0, visible)} max={periodRows[0]?.count ?? 0} />
        )
      ) : (
        <CompareRows rows={compareRows.slice(0, visible)} maxAbs={Math.max(1, ...compareRows.map(r => Math.abs(r.delta)))} isAffiliation={axis === 'affiliation'} />
      )}

      {visible < total && <div ref={sentinel} className="h-8" />}
    </div>
  )
}
