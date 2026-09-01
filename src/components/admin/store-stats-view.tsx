'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Search, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MemberNameLink } from '@/components/layout/member-name-link'
import type { StoreStats, StoreStatRow } from '@/lib/store-stats'

type MetricKey = 'target' | 'applied' | 'certified' | 'notApplied' | 'pending'
type SortKey = 'name' | MetricKey

const COLUMNS: { key: MetricKey; short: string; full: string }[] = [
  { key: 'target', short: '対象', full: '対象従業員数' },
  { key: 'applied', short: '申請', full: 'スキル申請人数' },
  { key: 'certified', short: '承認', full: '承認済み人数' },
  { key: 'notApplied', short: '未申請', full: '未申請人数' },
  { key: 'pending', short: '未承認', full: '未承認件数' },
]

const NUM = 'text-right tabular-nums'

export function StoreStatsView({ stats }: { stats: StoreStats }) {
  const [sortKey, setSortKey] = useState<SortKey>('notApplied')
  const [asc, setAsc] = useState(false)
  const [brand, setBrand] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showDef, setShowDef] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim()
    const matchesBrand = (r: StoreStatRow) => {
      if (brand === 'all') return true
      if (brand === 'store') return r.type === 'store'
      if (brand === 'other') return r.type !== 'store'
      return r.brandName === brand
    }
    const filtered = stats.rows.filter(r => matchesBrand(r) && (!q || r.name.includes(q)))
    const dir = asc ? 1 : -1
    return [...filtered].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name, 'ja') * dir
        : (a[sortKey] - b[sortKey]) * dir || a.name.localeCompare(b.name, 'ja'),
    )
  }, [stats.rows, sortKey, asc, brand, query])

  const shown = useMemo(
    () => rows.reduce(
      (s, r) => ({
        target: s.target + r.target,
        applied: s.applied + r.applied,
        certified: s.certified + r.certified,
        notApplied: s.notApplied + r.notApplied,
        pending: s.pending + r.pending,
      }),
      { target: 0, applied: 0, certified: 0, notApplied: 0, pending: 0 },
    ),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAsc(prev => !prev)
    else { setSortKey(key); setAsc(key === 'name') }
  }

  const downloadCsv = () => {
    const header = ['所属', '区分', 'ブランド', '対象従業員数', 'スキル申請人数', '承認済み人数', '未申請人数', '未承認件数']
    const body = rows.map(r => [
      r.name,
      r.type === 'store' ? '店舗' : r.type === 'department' ? '部署' : 'その他',
      r.brandName ?? '',
      r.target, r.applied, r.certified, r.notApplied, r.pending,
    ])
    const esc = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`)
    const csv = [header, ...body].map(cols => cols.map(esc).join(',')).join('\r\n')
    // Excel で開いても文字化けしないよう BOM 付き UTF-8
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `店舗別スキル状況_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      {/* 全社サマリー */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">全社合計</p>
        <div className="grid grid-cols-5 gap-1">
          {COLUMNS.map(c => (
            <div key={c.key} className="rounded-lg bg-gray-50 py-2 text-center">
              <p className="text-[10px] text-gray-500 leading-none">{c.short}</p>
              <p className={cn(
                'text-lg font-bold leading-tight mt-1 tabular-nums',
                c.key === 'notApplied' ? 'text-rose-600' : c.key === 'pending' ? 'text-amber-600' : 'text-gray-800',
              )}>
                {stats.total[c.key]}
              </p>
              <p className="text-[9px] text-gray-400 leading-none">{c.key === 'pending' ? '件' : '人'}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
          複数の所属を持つ人は各行に計上されるため、行の合計と全社合計は一致しません。
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
          <dl className="px-3 pb-3 space-y-1.5 text-[11px] leading-relaxed border-t border-gray-100 pt-2">
            {[
              ['対象従業員数', 'その所属にメンバーとして在籍する、承認済みの社員数（テストデータは除外）。リーダーも含みます。'],
              ['スキル申請人数', '対象従業員のうち、スキル申請を1件以上出したことがある人数。'],
              ['承認済み人数', '対象従業員のうち、認定済みの申請を1件以上持つ人数。'],
              ['未申請人数', '対象従業員数 − スキル申請人数。一度も申請していない人数。'],
              ['未承認件数', '承認待ちのまま残っている申請の「件数」（人数ではありません）。'],
            ].map(([term, desc]) => (
              <div key={term}>
                <dt className="font-semibold text-gray-700 inline">{term}：</dt>
                <dd className="text-gray-500 inline"> {desc}</dd>
              </div>
            ))}
          </dl>
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
            <button
              key={opt.key}
              onClick={() => setBrand(opt.key)}
              className={cn(
                'whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                brand === opt.key ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300',
              )}
            >
              {opt.label}
            </button>
          ))}
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

      {/* 一覧 */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-gray-500">
                <SortButton label="所属" active={sortKey === 'name'} asc={asc} onClick={() => toggleSort('name')} />
              </th>
              {COLUMNS.map(c => (
                <th key={c.key} className="px-1 py-2 font-medium text-gray-500" title={c.full}>
                  <SortButton label={c.short} active={sortKey === c.key} asc={asc} onClick={() => toggleSort(c.key)} align="right" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <StatRow key={r.id} row={r} expanded={expanded === r.id} onToggle={() => setExpanded(prev => (prev === r.id ? null : r.id))} />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">該当する所属がありません</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold text-gray-700">
                <td className="px-2 py-2">表示中 {rows.length}件の合計</td>
                <td className={cn(NUM, 'px-1 py-2')}>{shown.target}</td>
                <td className={cn(NUM, 'px-1 py-2')}>{shown.applied}</td>
                <td className={cn(NUM, 'px-1 py-2')}>{shown.certified}</td>
                <td className={cn(NUM, 'px-1 py-2 text-rose-600')}>{shown.notApplied}</td>
                <td className={cn(NUM, 'px-1 py-2 text-amber-600')}>{shown.pending}</td>
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

function SortButton({ label, active, asc, onClick, align = 'left' }: { label: string; active: boolean; asc: boolean; onClick: () => void; align?: 'left' | 'right' }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-0.5 w-full', align === 'right' ? 'justify-end' : 'justify-start', active ? 'text-orange-600 font-semibold' : 'hover:text-gray-700')}
    >
      {label}
      {active && (asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
    </button>
  )
}

function StatRow({ row, expanded, onToggle }: { row: StoreStatRow; expanded: boolean; onToggle: () => void }) {
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
        <td className={cn(NUM, 'px-1 py-2 text-gray-700')}>{row.target}</td>
        <td className={cn(NUM, 'px-1 py-2 text-gray-700')}>{row.applied}</td>
        <td className={cn(NUM, 'px-1 py-2 text-emerald-600 font-medium')}>{row.certified}</td>
        <td className={cn(NUM, 'px-1 py-2 font-medium', row.notApplied > 0 ? 'text-rose-600' : 'text-gray-300')}>{row.notApplied}</td>
        <td className={cn(NUM, 'px-1 py-2 font-medium', row.pending > 0 ? 'text-amber-600' : 'text-gray-300')}>{row.pending}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-gray-50/70 px-2 py-2">
            {row.brandName && <p className="text-[10px] text-gray-500 mb-1.5">ブランド: {row.brandName}</p>}
            {row.members.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-2 text-center">対象の従業員がいません</p>
            ) : (
              <ul className="divide-y divide-gray-200/70">
                {row.members.map(m => (
                  <li key={m.id} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 min-w-0 truncate text-[11px] text-gray-700">
                      <MemberNameLink employeeId={m.id}>{m.name}</MemberNameLink>
                    </span>
                    {m.applied === 0 ? (
                      <span className="flex-shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">未申請</span>
                    ) : (
                      <span className="flex-shrink-0 text-[10px] tabular-nums text-gray-500">
                        申請{m.applied}
                        <span className="text-emerald-600"> / 認定{m.certified}</span>
                        {m.pending > 0 && <span className="text-amber-600"> / 未承認{m.pending}</span>}
                        {m.rejected > 0 && <span className="text-gray-400"> / 差戻{m.rejected}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
