'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, HelpCircle, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RosterCheck } from '@/lib/roster-affiliation'
import { setRosterDeptAlias } from '@/app/(dashboard)/admin/roster-check/actions'

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')

/**
 * 名簿の店舗部署と、Mission Board の所属が違う人の一覧。
 * 1) 名簿の店舗部署名がアプリのどの店舗・部署か分からないものは、先に対応づけてもらう
 * 2) 所属が違う人は、所属一覧のその店舗を開いて直してもらう（ここでは所属を書き換えない）
 */
export function RosterCheckView({ check }: { check: RosterCheck }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const mismatches = check.items.filter(i => i.kind === 'mismatch')

  const saveAlias = (name: string, teamId: string | null) => {
    startTransition(async () => {
      const res = await setRosterDeptAlias(name, teamId)
      if (res.error) { toast.error(res.error); return }
      toast.success(teamId ? '対応づけました' : '対応づけを外しました')
      router.refresh()
    })
  }

  if (check.checked === 0) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 text-sm text-gray-700">
          <p className="font-semibold text-gray-800">まだ名簿の店舗部署が取り込まれていません</p>
          <p className="text-xs text-gray-500 leading-relaxed">「名簿の一括取込」で、見出しに「店舗部署」がある在職者名簿を取り込むと、Mission Board の所属と違う人をここに一覧で出します。</p>
          <Link href="/admin/roster-import" className="inline-flex items-center gap-1.5 text-orange-600 text-sm font-medium hover:underline">
            <Upload className="w-4 h-4" />名簿の一括取込へ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5">
        <p className="text-sm text-gray-800">
          名簿の店舗部署がある <span className="font-semibold">{check.checked}名</span> のうち、
          {check.items.length === 0
            ? <span className="font-semibold text-emerald-700">全員が Mission Board の所属と一致しています。</span>
            : <>確認が必要な方が <span className="font-semibold text-rose-700">{check.items.length}名</span> います。</>}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed flex items-start gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>名簿の店舗が、Mission Board の所属（店舗・部署のメンバー）のどれかに入っていれば一致とします（兼務は違いにしません）。退職日を過ぎた方・テスト用の方、店舗に所属しない上長（運用管理者）は対象外です。ここでは所属を書き換えません。所属一覧で直すと、この一覧から消えます。</span>
        </p>
      </div>

      {check.unknownDepts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />アプリのどの店舗・部署か分からない名簿の店舗部署 {check.unknownDepts.length}件
          </p>
          <p className="text-xs text-amber-800/80">名簿の書き方がアプリの店舗名と違うものです。一度対応づければ、次の取り込みからも使われます。</p>
          <ul className="space-y-2">
            {check.unknownDepts.map(d => (
              <li key={d.name} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-800 min-w-32">{d.name}<span className="ml-1 text-xs text-gray-500">（{d.count}名）</span></span>
                <span className="text-gray-400">→</span>
                <select
                  value={picked[d.name] ?? ''}
                  onChange={e => setPicked(p => ({ ...p, [d.name]: e.target.value }))}
                  className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
                  aria-label={`${d.name} に当たる店舗・部署`}
                >
                  <option value="">店舗・部署を選ぶ</option>
                  {check.teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.type === 'department' ? '（部署）' : ''}</option>)}
                </select>
                <Button size="sm" disabled={isPending || !picked[d.name]} onClick={() => saveAlias(d.name, picked[d.name])} className="h-8 bg-orange-500 hover:bg-orange-600 text-white">
                  対応づける
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mismatches.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-rose-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />名簿と所属が違う方 {mismatches.length}名
          </p>
          <ul className="divide-y divide-gray-100">
            {mismatches.map(m => (
              <li key={m.employeeId} className="py-2.5 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-medium text-gray-800 text-sm">{m.name}</span>
                  {m.rosterDeptAt && <span className="text-[10px] text-gray-400">名簿 {fmtDate(m.rosterDeptAt)} 取込</span>}
                </div>
                <div className="text-xs text-gray-600 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5">
                  <span className="text-gray-400">名簿</span><span>{m.rosterDept}{m.rosterTeam && m.rosterTeam.name !== m.rosterDept ? `（${m.rosterTeam.name}）` : ''}</span>
                  <span className="text-gray-400">アプリ</span><span>{m.mbTeams.length ? m.mbTeams.map(t => t.name).join('・') : '所属なし'}</span>
                </div>
                {m.rosterTeam && (
                  <Link href={`/admin/teams?team=${m.rosterTeam.id}`} className="inline-block text-xs text-orange-600 font-medium hover:underline">
                    所属一覧で「{m.rosterTeam.name}」を開いて直す
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : check.unknownDepts.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />名簿と所属が違う方はいません
        </div>
      )}

      {check.aliases.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-gray-700">設定済みの対応づけ {check.aliases.length}件</summary>
          <ul className="mt-2 divide-y divide-gray-100">
            {check.aliases.map(a => (
              <li key={a.rosterName} className="py-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-gray-700">{a.rosterName}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700">{a.team?.name ?? '（削除された店舗）'}</span>
                <button type="button" disabled={isPending} onClick={() => saveAlias(a.rosterName, null)} className="ml-auto text-gray-400 underline hover:text-gray-600">対応づけを外す</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-gray-400">名簿を取り込み直すと、名簿の店舗部署も新しい値に変わります。 <Link href="/admin/roster-import" className="underline">名簿の一括取込</Link></p>
    </div>
  )
}
