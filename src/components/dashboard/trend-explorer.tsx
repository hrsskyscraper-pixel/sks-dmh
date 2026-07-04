'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { AffFilter } from '@/components/dashboard/aff-filter'
import type { RankingDataset } from '@/lib/ranking-data'
import type { TrendPoint, TrendSeries } from '@/components/charts/trend-chart'

// recharts は ssr:false で遅延ロード（既存チャートと同じパターン）
const TrendChart = dynamic(() => import('@/components/charts/trend-chart').then(m => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-[260px] flex items-center justify-center text-xs text-gray-400">読み込み中…</div>,
})

type Axis = 'personal' | 'affiliation'
type Metric = 'monthly' | 'cumulative'

// カテゴリカルパレット（固定順・CVD検証済み）。系列の色は選択時にスロットを割り当て、
// 他の系列を出し入れしても色が変わらないように保持する。
const PALETTE = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
const MAX_SERIES = PALETTE.length
const CHIP_LIMIT = 30
const DEFAULT_SELECT = 5

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

export function TrendExplorer({ dataset, currentEmployeeId }: { dataset: RankingDataset; currentEmployeeId?: string }) {
  const [axis, setAxis] = useState<Axis>('personal')
  const [affId, setAffId] = useState('all')
  const [metric, setMetric] = useState<Metric>('monthly')

  // 時系列の月（古い→新しい）。periods は last30 → 当月 → 過去月 の順で入っている
  const months = useMemo(() => {
    const ms = dataset.periods.filter(p => p.key !== 'last30')
    return [...ms].reverse()
  }, [dataset])

  // 月ラベル: 同一年なら「6月」、複数年にまたがる場合は「25/6」形式
  const monthLabels = useMemo(() => {
    const years = new Set(months.map(m => m.key.slice(0, 4)))
    return months.map(m => {
      const [y, mo] = m.key.split('-')
      return years.size > 1 ? `${y.slice(2)}/${Number(mo)}` : `${Number(mo)}月`
    })
  }, [months])

  // 切り口＋フィルタ適用後の候補（合計降順）
  const candidates = useMemo(() => {
    let metas = axis === 'personal' ? dataset.personalMeta : dataset.affiliationMeta
    if (axis === 'personal' && affId !== 'all') {
      const memberSet = new Set(dataset.membersByAff[affId] ?? [])
      metas = metas.filter(m => memberSet.has(m.id))
    }
    const countsOf = axis === 'personal' ? dataset.empCount : dataset.affCount
    return metas
      .map(meta => ({ meta, total: months.reduce((s, m) => s + (countsOf[m.key]?.[meta.id] ?? 0), 0) }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total || a.meta.name.localeCompare(b.meta.name, 'ja'))
  }, [axis, affId, dataset, months])

  // 選択系列と色スロット（選択時に空きスロットを割り当て、解除まで保持＝色が入れ替わらない）
  const defaultSelection = useMemo(() => {
    const ids = candidates.slice(0, DEFAULT_SELECT).map(c => c.meta.id)
    if (axis === 'personal' && currentEmployeeId && !ids.includes(currentEmployeeId)
      && candidates.some(c => c.meta.id === currentEmployeeId)) {
      ids.push(currentEmployeeId)
    }
    return ids
  }, [candidates, axis, currentEmployeeId])

  const [slots, setSlots] = useState<Record<string, number>>(() => Object.fromEntries(defaultSelection.map((id, i) => [id, i])))
  // 切り口・フィルタ変更で選択をリセット（レンダー中に調整＝effect不要）
  const viewKey = `${axis}:${affId}`
  const [prevView, setPrevView] = useState(viewKey)
  if (viewKey !== prevView) {
    setPrevView(viewKey)
    setSlots(Object.fromEntries(defaultSelection.map((id, i) => [id, i])))
  }

  const toggle = (id: string) => {
    setSlots(prev => {
      if (id in prev) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      if (Object.keys(prev).length >= MAX_SERIES) return prev
      const used = new Set(Object.values(prev))
      let slot = 0
      while (used.has(slot)) slot++
      return { ...prev, [id]: slot }
    })
  }

  const selectedCount = Object.keys(slots).length
  const nameOf = useMemo(() => {
    const metas = axis === 'personal' ? dataset.personalMeta : dataset.affiliationMeta
    return Object.fromEntries(metas.map(m => [m.id, m.name]))
  }, [axis, dataset])

  // チャートの系列（スロット順で凡例・tooltipの並びを安定させる）
  const series: TrendSeries[] = useMemo(() =>
    Object.entries(slots)
      .sort((a, b) => a[1] - b[1])
      .map(([id, slot]) => ({ id, name: nameOf[id] ?? '', color: PALETTE[slot] })),
  [slots, nameOf])

  const data: TrendPoint[] = useMemo(() => {
    const countsOf = axis === 'personal' ? dataset.empCount : dataset.affCount
    const running: Record<string, number> = {}
    return months.map((m, i) => {
      const row: TrendPoint = { month: monthLabels[i] }
      for (const s of series) {
        const v = countsOf[m.key]?.[s.id] ?? 0
        running[s.id] = (running[s.id] ?? 0) + v
        row[s.id] = metric === 'cumulative' ? running[s.id] : v
      }
      return row
    })
  }, [axis, dataset, months, monthLabels, series, metric])

  const affName = affId !== 'all' ? dataset.affiliationMeta.find(a => a.id === affId)?.name : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Seg<Axis> value={axis} onChange={setAxis} options={[{ key: 'personal', label: '個人別' }, { key: 'affiliation', label: '所属別' }]} />
        <Seg<Metric> value={metric} onChange={setMetric} options={[{ key: 'monthly', label: '月別' }, { key: 'cumulative', label: '累計' }]} />
        {axis === 'personal' && (
          <AffFilter options={dataset.affiliationMeta} value={affId} onChange={setAffId} />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        {metric === 'monthly' ? '月別のスキル認定数の推移' : 'スキル認定数の累計の推移'}
        {axis === 'affiliation' ? '（所属メンバーの合算）' : affName ? `（${affName}のメンバー）` : ''}
        ・下のリストをタップして表示する{axis === 'personal' ? 'メンバー' : '所属'}を選べます（最大{MAX_SERIES}件）
      </p>

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">該当するデータがありません</p>
      ) : (
        <>
          {series.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">下のリストから表示する{axis === 'personal' ? 'メンバー' : '所属'}を選んでください</p>
          ) : (
            <TrendChart data={data} series={series} unit="個" />
          )}

          <div className="flex flex-wrap gap-1.5">
            {candidates.slice(0, CHIP_LIMIT).map((c, i) => {
              const selected = c.meta.id in slots
              const color = selected ? PALETTE[slots[c.meta.id]] : undefined
              const full = !selected && selectedCount >= MAX_SERIES
              return (
                <button
                  key={c.meta.id}
                  onClick={() => toggle(c.meta.id)}
                  disabled={full}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors',
                    selected ? 'bg-white border-gray-300 text-gray-800 font-medium shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500',
                    full ? 'opacity-40 cursor-not-allowed' : 'hover:border-orange-300',
                  )}
                >
                  <span className="text-[9px] text-gray-400">{i + 1}</span>
                  {selected && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} aria-hidden />}
                  <span className="max-w-[9rem] truncate">{c.meta.name}</span>
                  <span className="text-[10px] text-gray-400">{c.total}</span>
                </button>
              )
            })}
          </div>
          {candidates.length > CHIP_LIMIT && (
            <p className="text-[10px] text-gray-400">認定数の多い上位{CHIP_LIMIT}件を表示しています（全{candidates.length}件）</p>
          )}
        </>
      )}
    </div>
  )
}
