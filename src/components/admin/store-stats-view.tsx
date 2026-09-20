'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Search, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MemberNameLink } from '@/components/layout/member-name-link'
import {
  STALLED_DAYS, NEWCOMER_DAYS, RETENTION_DAYS, aggregateMembers, computeRetention,
  type StoreStats, type StoreStatRow, type StoreStatMember, type RetentionByDays,
} from '@/lib/store-stats'

type MetricKey = 'target' | 'applied' | 'certified' | 'notApplied' | 'pending' | 'stalled'
type RateKey = 'progress' | 'r30' | 'r60' | 'r90'
type SortKey = 'name' | MetricKey | RateKey

const COLUMNS: { key: MetricKey; short: string; unit: string; full: string }[] = [
  { key: 'target', short: '対象', unit: '人数', full: '対象従業員数' },
  { key: 'applied', short: '申請', unit: '人数', full: 'スキル申請人数' },
  { key: 'certified', short: '承認', unit: '人数', full: '承認済み人数' },
  { key: 'notApplied', short: '未申請', unit: '人数', full: '未申請人数' },
  { key: 'pending', short: '未承認', unit: '件数', full: '未承認件数' },
  { key: 'stalled', short: '停滞', unit: '人数', full: `停滞人数（${STALLED_DAYS}日以上申請なし）` },
]

/** 率の列（人事ダッシュボード。2026-09-19 決定 ⑥ で追加） */
const RATE_COLUMNS: { key: RateKey; short: string; unit: string; full: string }[] = [
  { key: 'progress', short: '進捗率', unit: '平均', full: '進捗率（所属カリキュラムの達成率の平均）' },
  { key: 'r30', short: '30日', unit: '定着', full: '30日定着率' },
  { key: 'r60', short: '60日', unit: '定着', full: '60日定着率' },
  { key: 'r90', short: '90日', unit: '定着', full: '90日定着率' },
]

/** 項目ごとの色。サマリー・表・数え方パネルで同じ色を使い、どの数字の説明かを目で追えるようにする */
const METRIC_COLOR: Record<MetricKey | RateKey, string> = {
  target: 'text-gray-800',
  applied: 'text-gray-800',
  certified: 'text-emerald-600',
  notApplied: 'text-rose-600',
  pending: 'text-amber-600',
  stalled: 'text-purple-600',
  progress: 'text-sky-700',
  r30: 'text-teal-700',
  r60: 'text-teal-700',
  r90: 'text-teal-700',
}

/**
 * 数え方パネルの定義。`match` は表の見出し・行名と同じ表記で、その部分だけを色付きの太字にする
 * （例: スキル**申請**人数 の「申請」が表の「申請」列）。
 */
const DEFINITIONS: { label: string; match: string; color: string; desc: string }[] = [
  { label: '対象従業員数', match: '対象', color: METRIC_COLOR.target, desc: 'その所属にメンバーとして在籍する、承認済み・在籍中（退職日なし）の社員数（テストデータは除外）。リーダーも含みます。' },
  { label: 'スキル申請人数', match: '申請', color: METRIC_COLOR.applied, desc: '対象従業員のうち、スキル申請を1件以上出したことがある人数。' },
  { label: '承認済み人数', match: '承認', color: METRIC_COLOR.certified, desc: '対象従業員のうち、認定済みの申請を1件以上持つ人数。' },
  { label: '未申請人数', match: '未申請', color: METRIC_COLOR.notApplied, desc: '対象従業員数 − スキル申請人数。一度も申請していない人数。' },
  { label: '未承認件数', match: '未承認', color: METRIC_COLOR.pending, desc: '承認待ちのまま残っている申請の「件数」（人数ではありません）。' },
  { label: '停滞人数', match: '停滞', color: METRIC_COLOR.stalled, desc: `最後の動き（最終申請日。一度も申請していない人は登録日）から ${STALLED_DAYS} 日以上、申請が1件も無い人数。育成が止まっている人の目安です。` },
  { label: '進捗率', match: '進捗率', color: METRIC_COLOR.progress, desc: '対象従業員それぞれの「所属カリキュラムのスキルのうち認定済みの割合」の平均。カリキュラムに所属していない人は数えません（誰もいなければ —）。' },
  { label: '30日／60日／90日定着率', match: '定着率', color: METRIC_COLOR.r90, desc: '入社日からその日数を経過した入社者（退職者を含む）のうち、その日に在籍していた割合。入社日の無い人は数えません。入社日・退職日が揃うまでは — が並びます。' },
  { label: '新人', match: '新人', color: 'text-gray-700', desc: `入社日から ${NEWCOMER_DAYS} 日以内の在籍者。入社日が無い人は含みません。` },
  { label: '重複分', match: '重複分', color: 'text-gray-500', desc: '店舗と部署の掛け持ちなど、複数の所属に登録されている人の二重計上分。各行の合計から差し引くマイナスの数値です。' },
  { label: '合計', match: '合計', color: 'text-gray-800', desc: '各行の合計 ＋ 重複分。同じ人を1人として数えた実人数（未承認件数は実件数。率は実人数で計算し直した値）です。' },
]

const NUM = 'text-right tabular-nums'

/** 展開したメンバー一覧の絞り込み条件（表の各列に対応） */
const MEMBER_FILTER: Record<MetricKey, (m: StoreStatMember) => boolean> = {
  target: () => true,
  applied: m => m.applied > 0,
  certified: m => m.certified > 0,
  notApplied: m => m.applied === 0,
  pending: m => m.pending > 0,
  stalled: m => m.stalled,
}

const FILTER_CAPTION: Record<MetricKey, string> = {
  target: 'この所属のメンバー全員',
  applied: '申請を出したことがある人',
  certified: '認定を受けたことがある人',
  notApplied: '一度も申請していない人',
  pending: '承認待ちの申請がある人',
  stalled: `${STALLED_DAYS}日以上、申請が止まっている人`,
}

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
const rateOf = (r: RetentionByDays, n: (typeof RETENTION_DAYS)[number]): number | null =>
  r[n].eligible > 0 ? Math.round((r[n].retained / r[n].eligible) * 100) : null
const rateKeyDays: Record<Exclude<RateKey, 'progress'>, (typeof RETENTION_DAYS)[number]> = { r30: 30, r60: 60, r90: 90 }
const rateValue = (row: { progress: number | null; retention: RetentionByDays }, key: RateKey): number | null =>
  key === 'progress' ? row.progress : rateOf(row.retention, rateKeyDays[key])
const fmtMonth = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`

type Scope = 'all' | 'newcomer'

export function StoreStatsView({ stats }: { stats: StoreStats }) {
  const [sortKey, setSortKey] = useState<SortKey>('notApplied')
  const [asc, setAsc] = useState(false)
  const [brand, setBrand] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showDef, setShowDef] = useState(false)
  const [hireMonth, setHireMonth] = useState<string>('all')
  const [scope, setScope] = useState<Scope>('all')

  /** 入社月の選択肢（在籍者・退職者の入社日から） */
  const hireMonths = useMemo(() => {
    const set = new Set<string>()
    for (const r of stats.rows) {
      for (const m of r.members) if (m.hireDate) set.add(m.hireDate.slice(0, 7))
      for (const c of r.cohort) set.add(c.hireDate.slice(0, 7))
    }
    return [...set].sort().reverse()
  }, [stats.rows])

  const memberFilterActive = hireMonth !== 'all' || scope !== 'all'
  const memberPred = (m: { hireDate: string | null; daysSinceHire?: number | null }) => {
    if (hireMonth !== 'all' && (m.hireDate ?? '').slice(0, 7) !== hireMonth) return false
    if (scope === 'newcomer' && (m.daysSinceHire === null || m.daysSinceHire === undefined || m.daysSinceHire > NEWCOMER_DAYS)) return false
    return true
  }
  const cohortPred = (c: { hireDate: string }) => {
    if (hireMonth !== 'all' && c.hireDate.slice(0, 7) !== hireMonth) return false
    if (scope === 'newcomer') {
      const days = Math.floor((Date.now() - Date.parse(c.hireDate)) / 86400000)
      if (days > NEWCOMER_DAYS) return false
    }
    return true
  }

  /** 入社月・新人の絞り込みを掛けた行（数字は members から出し直す） */
  const baseRows = useMemo<StoreStatRow[]>(() => {
    if (!memberFilterActive) return stats.rows
    return stats.rows.map(r => {
      const members = r.members.filter(memberPred)
      const cohort = r.cohort.filter(cohortPred)
      return { ...r, members, cohort, ...aggregateMembers(members), retention: computeRetention(cohort) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.rows, hireMonth, scope])

  const rows = useMemo(() => {
    const q = query.trim()
    const matchesBrand = (r: StoreStatRow) => {
      if (brand === 'all') return true
      if (brand === 'store') return r.type === 'store'
      if (brand === 'other') return r.type !== 'store'
      return r.brandName === brand
    }
    const filtered = baseRows.filter(r => matchesBrand(r) && (!q || r.name.includes(q)) && (!memberFilterActive || r.target > 0 || r.cohort.length > 0))
    const dir = asc ? 1 : -1
    const val = (r: StoreStatRow): number =>
      sortKey === 'name' ? 0
        : (sortKey in rateKeyDays || sortKey === 'progress') ? (rateValue(r, sortKey as RateKey) ?? -1)
          : r[sortKey as MetricKey]
    return [...filtered].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name, 'ja') * dir
        : (val(a) - val(b)) * dir || a.name.localeCompare(b.name, 'ja'),
    )
  }, [baseRows, sortKey, asc, brand, query, memberFilterActive])

  /** 表示中の行の単純合計（複数所属の人は各行に計上されている） */
  const shownRaw = useMemo(
    () => rows.reduce(
      (s, r) => ({
        target: s.target + r.target,
        applied: s.applied + r.applied,
        certified: s.certified + r.certified,
        notApplied: s.notApplied + r.notApplied,
        pending: s.pending + r.pending,
        stalled: s.stalled + r.stalled,
      }),
      { target: 0, applied: 0, certified: 0, notApplied: 0, pending: 0, stalled: 0 },
    ),
    [rows],
  )

  /** 表示中の行を人物単位で重複排除した合計（＝実人数の合計） */
  const shownUnique = useMemo(() => {
    const byId = new Map<string, StoreStatMember>()
    const cohortById = new Map<string, { hireDate: string; leftAt: string | null }>()
    for (const r of rows) {
      for (const m of r.members) byId.set(m.id, m)
      for (const c of r.cohort) cohortById.set(c.id, c)
    }
    return { ...aggregateMembers([...byId.values()]), retention: computeRetention([...cohortById.values()]) }
  }, [rows])

  /** 全社合計（入社月・新人の絞り込みだけを反映。ブランド・検索は反映しない） */
  const grandTotal = useMemo(() => {
    if (!memberFilterActive) return stats.total
    const byId = new Map<string, StoreStatMember>()
    const cohortById = new Map<string, { hireDate: string; leftAt: string | null }>()
    for (const r of baseRows) {
      for (const m of r.members) byId.set(m.id, m)
      for (const c of r.cohort) cohortById.set(c.id, c)
    }
    return { ...aggregateMembers([...byId.values()]), retention: computeRetention([...cohortById.values()]) }
  }, [stats.total, baseRows, memberFilterActive])

  /** 二重計上の戻し分（各行の合計 ＋ 重複分 ＝ 合計 になるようマイナスで持つ） */
  const duplicated = useMemo(
    () => ({
      target: shownUnique.target - shownRaw.target,
      applied: shownUnique.applied - shownRaw.applied,
      certified: shownUnique.certified - shownRaw.certified,
      notApplied: shownUnique.notApplied - shownRaw.notApplied,
      pending: shownUnique.pending - shownRaw.pending,
      stalled: shownUnique.stalled - shownRaw.stalled,
    }),
    [shownRaw, shownUnique],
  )

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAsc(prev => !prev)
    else { setSortKey(key); setAsc(key === 'name') }
  }

  const downloadCsv = () => {
    const header = ['所属', '区分', 'ブランド', '対象従業員数', 'スキル申請人数', '承認済み人数', '未申請人数', '未承認件数', `停滞人数（${STALLED_DAYS}日以上申請なし）`, '進捗率(%)', '30日定着率(%)', '30日対象人数', '60日定着率(%)', '60日対象人数', '90日定着率(%)', '90日対象人数']
    const rateCols = (r: { progress: number | null; retention: RetentionByDays }) => [
      r.progress ?? '',
      rateOf(r.retention, 30) ?? '', r.retention[30].eligible,
      rateOf(r.retention, 60) ?? '', r.retention[60].eligible,
      rateOf(r.retention, 90) ?? '', r.retention[90].eligible,
    ]
    const body = rows.map(r => [
      r.name,
      r.type === 'store' ? '店舗' : r.type === 'department' ? '部署' : 'その他',
      r.brandName ?? '',
      r.target, r.applied, r.certified, r.notApplied, r.pending, r.stalled,
      ...rateCols(r),
    ])
    const footer = [
      ['重複分（掛け持ちの二重計上）', '', '', duplicated.target, duplicated.applied, duplicated.certified, duplicated.notApplied, duplicated.pending, duplicated.stalled, '', '', '', '', '', '', ''],
      ['合計（実人数）', '', '', shownUnique.target, shownUnique.applied, shownUnique.certified, shownUnique.notApplied, shownUnique.pending, shownUnique.stalled, ...rateCols(shownUnique)],
    ]
    const cond = [`絞り込み: 入社月=${hireMonth === 'all' ? 'すべて' : fmtMonth(hireMonth)} / 対象=${scope === 'newcomer' ? `新人（入社${NEWCOMER_DAYS}日以内）` : '全員'}`]
    const esc = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`)
    const csv = [header, ...body, ...footer, [], cond].map(cols => cols.map(esc).join(',')).join('\r\n')
    // Excel で開いても文字化けしないよう BOM 付き UTF-8
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `店舗別スキル状況_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const chip = (active: boolean) =>
    cn('whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
      active ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300')

  return (
    <div className="space-y-3">
      {/* 全社サマリー */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">
          全社合計
          {memberFilterActive && (
            <span className="ml-2 font-normal text-gray-500">
              {hireMonth !== 'all' && `入社月 ${fmtMonth(hireMonth)}`}{hireMonth !== 'all' && scope === 'newcomer' && ' ・ '}{scope === 'newcomer' && `新人（入社${NEWCOMER_DAYS}日以内）`}
            </span>
          )}
        </p>
        <div className="grid grid-cols-6 gap-1">
          {COLUMNS.map(c => (
            <div key={c.key} className="rounded-lg bg-gray-50 py-2 text-center">
              <p className={cn('text-[10px] leading-none font-medium', METRIC_COLOR[c.key])}>{c.short}</p>
              <p className={cn('text-lg font-bold leading-tight mt-1 tabular-nums', METRIC_COLOR[c.key])}>
                {grandTotal[c.key]}
              </p>
              <p className="text-[9px] text-gray-400 leading-none">{c.key === 'pending' ? '件' : '人'}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {RATE_COLUMNS.map(c => {
            const v = rateValue(grandTotal, c.key)
            const n = c.key === 'progress' ? null : grandTotal.retention[rateKeyDays[c.key]].eligible
            return (
              <div key={c.key} className="rounded-lg bg-gray-50 py-2 text-center">
                <p className={cn('text-[10px] leading-none font-medium', METRIC_COLOR[c.key])}>{c.key === 'progress' ? '進捗率' : `${c.short}定着率`}</p>
                <p className={cn('text-lg font-bold leading-tight mt-1 tabular-nums', v === null ? 'text-gray-300' : METRIC_COLOR[c.key])}>{pct(v)}</p>
                <p className="text-[9px] text-gray-400 leading-none">{c.key === 'progress' ? '平均' : n === 0 ? '対象なし' : `対象 ${n}人`}</p>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
          複数の所属を持つ人は各行に計上されるため、一覧の下に差し引く「重複分」の行を置き、合計が実人数と一致するようにしています。
          定着率は入社日・退職日が登録されている人から計算します（揃うまでは —）。
        </p>
      </div>

      {/* 数え方 */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <button
          onClick={() => setShowDef(v => !v)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <HelpCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="flex-1 text-xs font-medium text-gray-700">数え方（各項目の定義）</span>
          {showDef ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
        </button>
        {showDef && (
          <div className="px-3 pb-3 border-t border-gray-100 pt-2">
            <p className="text-[10px] text-gray-400 mb-1.5">
              色の付いた太字が、表の見出し・行名と同じ表記です。
            </p>
            <dl className="space-y-1.5 text-[11px] leading-relaxed">
              {DEFINITIONS.map(d => {
                const at = d.label.indexOf(d.match)
                return (
                  <div key={d.label}>
                    <dt className="inline text-gray-500">
                      {d.label.slice(0, at)}
                      <span className={cn('font-bold', d.color)}>{d.match}</span>
                      {d.label.slice(at + d.match.length)}：
                    </dt>
                    <dd className="text-gray-500 inline"> {d.desc}</dd>
                  </div>
                )
              })}
            </dl>
          </div>
        )}
      </div>

      {/* 絞り込み */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {[
            { key: 'all', label: 'すべて' },
            { key: 'store', label: '店舗のみ' },
            ...stats.brands.map(b => ({ key: b, label: b })),
            { key: 'other', label: '店舗以外' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setBrand(opt.key)} className={chip(brand === opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
        {/* 入社月・新人（人事ダッシュボード） */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 items-center">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">対象:</span>
          <button onClick={() => setScope('all')} className={chip(scope === 'all')}>全員</button>
          <button onClick={() => setScope('newcomer')} className={chip(scope === 'newcomer')}>新人（入社{NEWCOMER_DAYS}日以内）</button>
          <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">入社月:</span>
          <select
            value={hireMonth}
            onChange={e => setHireMonth(e.target.value)}
            className={cn('h-7 rounded-full border px-2 text-xs bg-white', hireMonth === 'all' ? 'border-gray-200 text-gray-500' : 'border-orange-400 text-orange-700 font-medium')}
          >
            <option value="all">すべて</option>
            {hireMonths.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
          {hireMonths.length === 0 && <span className="text-[10px] text-gray-400">入社日の登録がまだありません</span>}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="店舗名で絞り込み"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:border-orange-300"
            />
          </div>
          <button
            onClick={downloadCsv}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="w-3.5 h-3.5 text-gray-400" />
            CSV
          </button>
        </div>
      </div>

      {/* 一覧（列が増えたので横スクロール可） */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className={cn('px-2 py-2 text-left font-medium', sortKey === 'name' && 'bg-orange-50')}>
                <SortButton label="所属" active={sortKey === 'name'} asc={asc} onClick={() => toggleSort('name')} color="text-gray-500" />
              </th>
              {COLUMNS.map(c => (
                <th key={c.key} className={cn('px-1 py-1.5 font-medium', sortKey === c.key && 'bg-orange-50')} title={c.full}>
                  <SortButton label={c.short} unit={c.unit} active={sortKey === c.key} asc={asc} onClick={() => toggleSort(c.key)} align="center" color={METRIC_COLOR[c.key]} />
                </th>
              ))}
              {RATE_COLUMNS.map(c => (
                <th key={c.key} className={cn('px-1 py-1.5 font-medium border-l border-gray-100', sortKey === c.key && 'bg-orange-50')} title={c.full}>
                  <SortButton label={c.short} unit={c.unit} active={sortKey === c.key} asc={asc} onClick={() => toggleSort(c.key)} align="center" color={METRIC_COLOR[c.key]} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <StatRow key={r.id} row={r} expanded={expanded === r.id} onToggle={() => setExpanded(prev => (prev === r.id ? null : r.id))} />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">該当する所属がありません</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-gray-200">
              <tr className="bg-white text-gray-600">
                <td className="px-2 py-2">
                  <span className="font-medium">重複分</span>
                  <span className="text-[10px] text-gray-400 ml-1">掛け持ちの二重計上</span>
                </td>
                {COLUMNS.map(c => (
                  <td key={c.key} className={cn(NUM, 'px-1 py-2', duplicated[c.key] === 0 ? 'text-gray-300' : 'text-gray-500')}>
                    {duplicated[c.key] === 0 ? 0 : duplicated[c.key]}
                  </td>
                ))}
                {RATE_COLUMNS.map(c => <td key={c.key} className={cn(NUM, 'px-1 py-2 text-gray-300 border-l border-gray-100')}>—</td>)}
              </tr>
              <tr className="bg-gray-50 font-semibold text-gray-700 border-t border-gray-200">
                <td className="px-2 py-2">合計（{rows.length}件・実人数）</td>
                {COLUMNS.map(c => (
                  <td key={c.key} className={cn(NUM, 'px-1 py-2', METRIC_COLOR[c.key])}>{shownUnique[c.key]}</td>
                ))}
                {RATE_COLUMNS.map(c => {
                  const v = rateValue(shownUnique, c.key)
                  return <td key={c.key} className={cn(NUM, 'px-1 py-2 border-l border-gray-100', v === null ? 'text-gray-300' : METRIC_COLOR[c.key])}>{pct(v)}</td>
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        {new Date(stats.generatedAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })} 時点
      </p>
    </div>
  )
}

/**
 * 並べ替えできる見出し。数値列は「対象 / 人数」のように2行・中央揃えで表示する。
 * 並べ替えの矢印は数値列では文字の下に置く（横に並べると列幅を食い、店舗名の幅が削られるため）。
 * 非表示のときも invisible で場所を確保し、押しても行の高さが動かないようにしている。
 */
function SortButton({ label, unit, active, asc, onClick, align = 'left', color }: { label: string; unit?: string; active: boolean; asc: boolean; onClick: () => void; align?: 'left' | 'center'; color: string }) {
  const centered = align === 'center'
  const Chevron = asc ? ChevronUp : ChevronDown
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center',
        centered ? 'flex-col justify-center text-center leading-tight' : 'justify-start gap-0.5',
        // 見出しの色は項目ごとに固定（数字と同じ色）。並べ替え中は太字＋背景で示す
        color,
        active ? 'font-bold' : 'opacity-80 hover:opacity-100',
      )}
    >
      <span>{label}</span>
      {unit && <span>{unit}</span>}
      <Chevron className={cn('w-3 h-3 flex-shrink-0', !active && 'invisible')} aria-hidden />
    </button>
  )
}

function StatRow({ row, expanded, onToggle }: { row: StoreStatRow; expanded: boolean; onToggle: () => void }) {
  // 展開したときに表示するメンバーの絞り込み（既定は全員）
  const [filter, setFilter] = useState<MetricKey>('target')
  const filteredMembers = useMemo(() => row.members.filter(MEMBER_FILTER[filter]), [row.members, filter])
  const leftCount = row.cohort.filter(c => c.leftAt).length

  return (
    <>
      <tr onClick={onToggle} className={cn('cursor-pointer hover:bg-orange-50/40', expanded && 'bg-orange-50/60')}>
        <td className="px-2 py-2 max-w-0">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronUp className="w-3 h-3 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-gray-300 flex-shrink-0" />}
            <span className="truncate text-gray-800 font-medium" title={row.name}>{row.name}</span>
            {row.type !== 'store' && (
              <span className={cn(
                'flex-shrink-0 rounded px-1 text-[9px] leading-4',
                row.type === 'department' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500',
              )}>
                {row.type === 'department' ? '部署' : '未設定'}
              </span>
            )}
          </div>
        </td>
        <td className={cn(NUM, 'px-1 py-2', METRIC_COLOR.target)}>{row.target}</td>
        <td className={cn(NUM, 'px-1 py-2', METRIC_COLOR.applied)}>{row.applied}</td>
        <td className={cn(NUM, 'px-1 py-2 font-medium', METRIC_COLOR.certified)}>{row.certified}</td>
        <td className={cn(NUM, 'px-1 py-2 font-medium', row.notApplied > 0 ? METRIC_COLOR.notApplied : 'text-gray-300')}>{row.notApplied}</td>
        <td className={cn(NUM, 'px-1 py-2 font-medium', row.pending > 0 ? METRIC_COLOR.pending : 'text-gray-300')}>{row.pending}</td>
        <td className={cn(NUM, 'px-1 py-2 font-medium', row.stalled > 0 ? METRIC_COLOR.stalled : 'text-gray-300')}>{row.stalled}</td>
        {RATE_COLUMNS.map(c => {
          const v = rateValue(row, c.key)
          const n = c.key === 'progress' ? null : row.retention[rateKeyDays[c.key]].eligible
          return (
            <td key={c.key} className={cn(NUM, 'px-1 py-2 border-l border-gray-100', v === null ? 'text-gray-300' : METRIC_COLOR[c.key])} title={n === null ? undefined : `対象 ${n}人`}>
              {pct(v)}
            </td>
          )
        })}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={11} className="bg-gray-50/70 px-2 py-2">
            {row.brandName && <p className="text-[10px] text-gray-500 mb-1.5">ブランド: {row.brandName}</p>}
            {(row.cohort.length > 0) && (
              <p className="text-[10px] text-gray-500 mb-1.5">
                定着率の対象（入社日あり）: {row.cohort.length}人（うち退職 {leftCount}人）
                {RETENTION_DAYS.map(n => ` ／ ${n}日: ${row.retention[n].retained}/${row.retention[n].eligible}`).join('')}
              </p>
            )}
            {row.members.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-2 text-center">対象の従業員がいません</p>
            ) : (
              <>
                {/* 内訳の数字。タップするとその内訳の人だけに絞り込める */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {COLUMNS.map(c => (
                    <button
                      key={c.key}
                      onClick={e => { e.stopPropagation(); setFilter(c.key) }}
                      className={cn(
                        'rounded-lg border px-2 py-1 text-[10px] leading-tight transition-colors',
                        METRIC_COLOR[c.key],
                        filter === c.key ? 'border-current bg-white font-bold' : 'border-gray-200 bg-white/60 opacity-70 hover:opacity-100',
                      )}
                    >
                      {c.short}
                      <span className="ml-1 text-xs font-bold tabular-nums">{row[c.key]}</span>
                      {c.key === 'pending' ? '件' : '人'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mb-1">
                  {FILTER_CAPTION[filter]}（{filteredMembers.length}人）
                </p>
                {filteredMembers.length === 0 ? (
                  <p className="text-[11px] text-gray-400 py-2 text-center">該当する人はいません</p>
                ) : (
                  <ul className="divide-y divide-gray-200/70">
                    {filteredMembers.map(m => (
                      <li key={m.id} className="py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 truncate text-[11px] text-gray-700">
                            <MemberNameLink employeeId={m.id}>{m.name}</MemberNameLink>
                          </span>
                          {m.stalled && (
                            <span className="flex-shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 tabular-nums" title={m.lastAppliedAt ? `最終申請 ${new Date(m.lastAppliedAt).toLocaleDateString('ja-JP')}` : '一度も申請なし'}>
                              停滞{m.stalledDays}日
                            </span>
                          )}
                          {m.applied === 0 ? (
                            <span className={cn('flex-shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium', 'text-rose-700')}>未申請</span>
                          ) : (
                            <span className="flex-shrink-0 text-[10px] tabular-nums text-gray-500">
                              申請{m.applied}
                              <span className={METRIC_COLOR.certified}> / 認定{m.certified}</span>
                              {m.pending > 0 && <span className={METRIC_COLOR.pending}> / 未承認{m.pending}</span>}
                              {m.rejected > 0 && <span className="text-gray-400"> / 差戻{m.rejected}</span>}
                              {m.lastAppliedAt && <span className="text-gray-400"> / 最終 {new Date(m.lastAppliedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</span>}
                            </span>
                          )}
                        </div>
                        {/* 人事ダッシュボード用の内訳: 次の項目／入社日／達成率 */}
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500 tabular-nums">
                          <span>次: <span className="text-gray-700">{m.nextSkill ?? '—'}</span></span>
                          <span>入社: <span className="text-gray-700">{m.hireDate ?? '未登録'}</span>{m.daysSinceHire !== null && <span className="text-gray-400">（{m.daysSinceHire}日目）</span>}</span>
                          <span>達成率: <span className={cn(m.progress === null ? 'text-gray-400' : METRIC_COLOR.progress)}>{pct(m.progress)}</span></span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
