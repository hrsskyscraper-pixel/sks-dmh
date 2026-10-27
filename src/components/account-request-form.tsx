'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createAccountRequest } from '@/app/(dashboard)/account-request/actions'

const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm'
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
const STATUS: Record<string, string> = { pending: '受付中', issued: '発行済み', declined: '見送り' }

/**
 * 運用管理者にアカウントの発行を依頼するフォーム（2026-10-27）。
 * 新しく入る方は、本人が登録するのではなく、運用管理者が社員リストで確かめて発行する。その「だれのアカウントが要るか」を伝える。
 */
export function AccountRequestForm({ teams, defaultTeamId, roles, mine, isAdmin }: {
  teams: { id: string; name: string }[]
  defaultTeamId: string
  roles: { id: string; name: string }[]
  mine: { id: string; name: string; status: string; declineReason: string | null; createdAt: string }[]
  isAdmin: boolean
}) {
  const blank = { last: '', first: '', lastKana: '', firstKana: '', number: '', hire: '', type: '' as '' | '社員' | 'メイト', teamId: defaultTeamId, roleIds: [] as string[], note: '' }
  const [f, setF] = useState(blank)
  const [isPending, startTransition] = useTransition()
  const ok = f.last.trim() && f.type && f.teamId

  return (
    <div className="p-4 space-y-5 max-w-2xl">
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 space-y-1">
        <p>新しく入る方のアカウントは、運用管理者が人事の社員リストで確かめてから発行します。分かる範囲で入れて、依頼してください。</p>
        <p>発行されると、その方専用のリンクができます。リンクは運用管理者から届きます。</p>
        {isAdmin && <p>運用管理者の方は、<Link href="/admin/account-issue" className="underline">アカウントの発行</Link>から直接発行できます。</p>}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">姓<input className={inputCls} value={f.last} onChange={e => setF({ ...f, last: e.target.value })} /></label>
          <label className="text-xs text-gray-600">名<input className={inputCls} value={f.first} onChange={e => setF({ ...f, first: e.target.value })} /></label>
          <label className="text-xs text-gray-600">せい（ふりがな）<input className={inputCls} value={f.lastKana} onChange={e => setF({ ...f, lastKana: e.target.value })} /></label>
          <label className="text-xs text-gray-600">めい（ふりがな）<input className={inputCls} value={f.firstKana} onChange={e => setF({ ...f, firstKana: e.target.value })} /></label>
          <label className="text-xs text-gray-600">社員番号（分かれば）<input className={inputCls} value={f.number} onChange={e => setF({ ...f, number: e.target.value })} /></label>
          <label className="text-xs text-gray-600">入社日<input type="date" className={inputCls} value={f.hire} onChange={e => setF({ ...f, hire: e.target.value })} /></label>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">区分</p>
          <div className="flex gap-2">
            {(['社員', 'メイト'] as const).map(t => (
              <Button key={t} size="sm" type="button" variant={f.type === t ? 'default' : 'outline'} onClick={() => setF({ ...f, type: t })}>{t}</Button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-gray-600">店舗・部署
          <select className={inputCls} value={f.teamId} onChange={e => setF({ ...f, teamId: e.target.value })}>
            <option value="">選んでください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">役職（あれば）</p>
          <div className="flex flex-wrap gap-2">
            {roles.map(r => (
              <label key={r.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={f.roleIds.includes(r.id)} onChange={e => setF({ ...f, roleIds: e.target.checked ? [...f.roleIds, r.id] : f.roleIds.filter(x => x !== r.id) })} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
        <label className="block text-xs text-gray-600">メモ（任意）
          <textarea className={inputCls} rows={2} maxLength={500} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="例）11/1 入社。研修から始めます" />
        </label>
        <Button disabled={isPending || !ok} onClick={() => startTransition(async () => {
          const res = await createAccountRequest({
            lastName: f.last, firstName: f.first, lastKana: f.lastKana || null, firstKana: f.firstKana || null,
            employeeNumber: f.number || null, employmentType: f.type || null, teamId: f.teamId || null,
            businessRoleIds: f.roleIds, hireDate: f.hire || null, note: f.note || null,
          })
          if (res.error) { toast.error(res.error); return }
          toast.success('依頼を送りました。発行されると、運用管理者からリンクが届きます')
          setF({ ...blank, teamId: f.teamId })
        })}>
          運用管理者にアカウントの発行を依頼する
        </Button>
        {!ok && <p className="text-[11px] text-gray-500">姓・区分・店舗を入れると依頼できます。</p>}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">これまでの依頼</h2>
        {mine.length === 0 ? <p className="text-xs text-gray-500">まだありません。</p> : (
          <ul className="divide-y text-sm">
            {mine.map(r => (
              <li key={r.id} className="py-1.5">
                <div className="flex justify-between gap-2"><span>{r.name} さん</span><span className="text-xs text-gray-500">{fmtDate(r.createdAt)}・{STATUS[r.status] ?? r.status}</span></div>
                {r.status === 'declined' && r.declineReason && <p className="text-xs text-gray-500">見送りの理由: {r.declineReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
