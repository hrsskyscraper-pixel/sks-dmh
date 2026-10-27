'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ShieldCheck } from 'lucide-react'
import { saveSeniorReview } from '@/app/(dashboard)/admin/settings/actions'
import type { OpsCandidate } from '@/components/admin/ops-team-recipients'

interface Props {
  roles: { id: string; name: string }[]
  candidates: OpsCandidate[]
  roleIds: string[]
  approverIds: string[]
  updatedBy: string | null
  updatedAt: string | null
}

/**
 * 管理者（マネージャー・エリアキャスト・課長など）の申請を承認する人（2026-10-23 原島さん確定 B-④-3）。
 * 選んだ役職の方の申請は、選んだ人だけが承認できる。どちらかが空のあいだは、これまでどおり（運用管理者ならだれでも）。
 */
export function SeniorReview({ roles, candidates, roleIds: initialRoles, approverIds: initialApprovers, updatedBy, updatedAt }: Props) {
  // 保存したあとで運用管理者でなくなった・退職した人は、承認できない（getSeniorReview が外す）ので、選んだ状態からも外して見せる
  const candidateIds = new Set(candidates.map(c => c.id))
  const liveApprovers = initialApprovers.filter(id => candidateIds.has(id))
  const droppedApprovers = initialApprovers.length - liveApprovers.length
  const [roleSel, setRoleSel] = useState<Set<string>>(new Set(initialRoles))
  const [apprSel, setApprSel] = useState<Set<string>>(new Set(liveApprovers))
  const [saved, setSaved] = useState({ roles: [...initialRoles].sort(), approvers: [...initialApprovers].sort() })
  const [isPending, startTransition] = useTransition()
  const dirty = JSON.stringify([...roleSel].sort()) !== JSON.stringify(saved.roles)
    || JSON.stringify([...apprSel].sort()) !== JSON.stringify(saved.approvers)
  const active = roleSel.size > 0 && apprSel.size > 0

  const toggle = (setter: typeof setRoleSel, id: string, on: boolean) =>
    setter(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  const save = () => {
    startTransition(async () => {
      const res = await saveSeniorReview([...roleSel], [...apprSel])
      if (res.error) { toast.error(res.error); return }
      // サーバーで保存した値を正とする
      const roles = res.roleIds ?? [], approvers = res.approverIds ?? []
      setRoleSel(new Set(roles))
      setApprSel(new Set(approvers))
      setSaved({ roles: [...roles].sort(), approvers: [...approvers].sort() })
      toast.success('管理者の申請を承認する人を保存しました')
    })
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">管理者の申請を承認する人</p>
          <p className="text-xs text-gray-500">マネージャー・エリアキャスト・課長など、選んだ役職の方のスキル申請を承認できる人</p>
        </div>
        <Button size="sm" onClick={save} disabled={isPending || !dirty} className="bg-indigo-600 hover:bg-indigo-700 text-white">保存</Button>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        選んだ役職の方の申請は、<span className="font-semibold text-gray-700">ここで選んだ人だけ</span>が承認できます（店舗に関係なく、承認センターに出ます）。
        ほかの運用管理者や、同じ役職の方どうしでは承認できません。
        {droppedApprovers > 0 && <span className="block mt-1 text-amber-700">選んでいた方のうち {droppedApprovers} 人は、運用管理者・開発者でなくなったか退職したため、承認できません。選び直して保存してください。</span>}
        {!active && <span className="block mt-1 text-amber-700">役職と承認する人の両方を選ぶまでは、これまでどおり運用管理者ならだれでも承認できます。</span>}
      </p>
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-1">対象の役職</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {roles.map(r => (
            <label key={r.id} className="flex items-center gap-1.5 text-sm text-gray-800 cursor-pointer">
              <Checkbox checked={roleSel.has(r.id)} onCheckedChange={v => toggle(setRoleSel, r.id, !!v)} disabled={isPending} />
              {r.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-1">承認する人</p>
        <ul className="divide-y divide-gray-100">
          {candidates.map(c => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <Checkbox id={`senior-${c.id}`} checked={apprSel.has(c.id)} onCheckedChange={v => toggle(setApprSel, c.id, !!v)} disabled={isPending} />
              <label htmlFor={`senior-${c.id}`} className="flex-1 min-w-0 text-sm text-gray-800 cursor-pointer">
                {c.name}
                <span className="ml-2 text-[10px] text-gray-400">{c.label}</span>
              </label>
            </li>
          ))}
          {candidates.length === 0 && <li className="py-2 text-xs text-gray-400">候補がいません（運用管理者・開発者が対象）</li>}
        </ul>
      </div>
      {updatedAt && <p className="text-[10px] text-gray-400">最終変更: {fmt(updatedAt)}{updatedBy ? `（${updatedBy}）` : ''}</p>}
    </div>
  )
}
