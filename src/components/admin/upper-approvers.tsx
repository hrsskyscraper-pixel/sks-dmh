'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { HelpCircle, X } from 'lucide-react'
import { setUpperApprover } from '@/app/(dashboard)/admin/upper-approvers/actions'

export type UpperRow = { teamId: string; teamName: string; leaders: { id: string; name: string }[]; uppers: { id: string; name: string; label: string }[] }
export type UpperCandidate = { id: string; name: string; label: string }

/**
 * 店舗ごとの「店長の申請を承認する人」。担当リーダー（店長）は自分の申請を自分で承認できないので、
 * MG・課長などをここで指定すると、その人の承認センターに店長の申請が出て、滞留の知らせも届く。
 */
export function UpperApproversView({ rows, candidates }: { rows: UpperRow[]; candidates: UpperCandidate[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const unset = rows.filter(r => r.leaders.length > 0 && r.uppers.length === 0).length

  const change = (teamId: string, employeeId: string, on: boolean) => {
    startTransition(async () => {
      const res = await setUpperApprover(teamId, employeeId, on)
      if (res.error) { toast.error(res.error); return }
      if (on) setPicked(p => ({ ...p, [teamId]: '' }))
      router.refresh()
    })
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5">
        <p className="text-sm text-gray-800">
          店舗の担当リーダー（店長）は、自分の申請を自分で承認できません。店舗ごとに、<span className="font-semibold">店長の申請を承認する人</span>（MG・課長など）を決めてください。
        </p>
        <p className="text-xs text-gray-500 leading-relaxed flex items-start gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>決めた人の承認センターに、その店舗の店長の申請が出ます。承認されないまま日がたつと、決めた人にも「要対応」で知らせます。選べるのは承認の権限がある人（育成リーダー以上）です。{unset > 0 && <> いま <span className="font-semibold text-rose-700">{unset}店舗</span> が未設定です。</>}</span>
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map(r => {
          const options = candidates.filter(c => !r.uppers.some(u => u.id === c.id) && !r.leaders.some(l => l.id === c.id))
          return (
            <li key={r.teamId} className={`rounded-xl border bg-white p-3 space-y-2 ${r.leaders.length > 0 && r.uppers.length === 0 ? 'border-rose-200' : 'border-gray-200'}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-sm font-semibold text-gray-800">{r.teamName}</span>
                <span className="text-xs text-gray-500">店長（担当リーダー）: {r.leaders.length ? r.leaders.map(l => l.name).join('・') : '未設定'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">承認する人:</span>
                {r.uppers.length === 0 && <span className="text-xs text-rose-600">未設定</span>}
                {r.uppers.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs text-orange-800">
                    {u.name}<span className="text-[10px] text-orange-500">{u.label}</span>
                    <button type="button" disabled={isPending} onClick={() => change(r.teamId, u.id, false)} aria-label={`${u.name}さんを外す`} className="text-orange-400 hover:text-orange-700"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={picked[r.teamId] ?? ''}
                  onChange={e => setPicked(p => ({ ...p, [r.teamId]: e.target.value }))}
                  className="h-8 flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 text-sm"
                  aria-label={`${r.teamName} の店長の申請を承認する人を選ぶ`}
                >
                  <option value="">承認する人を選ぶ</option>
                  {options.map(c => <option key={c.id} value={c.id}>{c.name}（{c.label}）</option>)}
                </select>
                <button
                  type="button"
                  disabled={isPending || !picked[r.teamId]}
                  onClick={() => change(r.teamId, picked[r.teamId], true)}
                  className="h-8 rounded-md bg-orange-500 px-3 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  追加
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
