'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Users } from 'lucide-react'
import { setOpsTeamRecipients } from '@/app/(dashboard)/admin/settings/actions'

export interface OpsCandidate { id: string; name: string; label: string; hasEmail: boolean; hasLine: boolean }

interface Props {
  candidates: OpsCandidate[]
  selectedIds: string[]
  updatedBy: string | null
  updatedAt: string | null
}

/**
 * 改善提案・Q&A の通知を届ける「運営チーム」の宛先。
 * メール／LINE の一括休止に関係なく届く（件数が少なく、運営が確実に受け取る必要があるため）。
 * 未選択のときは 運用管理者＋開発者 全員に届く（従来どおり）。
 */
export function OpsTeamRecipients({ candidates, selectedIds: initial, updatedBy, updatedAt }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))
  const [isPending, startTransition] = useTransition()
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...initial].sort())

  const save = () => {
    startTransition(async () => {
      const { error } = await setOpsTeamRecipients([...selected])
      if (error) { toast.error(error); return }
      toast.success('運営チームの通知先を保存しました')
    })
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">運営チームの通知先</p>
          <p className="text-xs text-gray-500">改善提案・Q&amp;A の書き込みを、メール（LINE連携済みなら LINE も）で受け取る人</p>
        </div>
        <Button size="sm" onClick={save} disabled={isPending || !dirty} className="bg-sky-600 hover:bg-sky-700 text-white">保存</Button>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        この通知は、メール・LINE の一括休止に<span className="font-semibold text-gray-700">関係なく届きます</span>。
        誰も選んでいないときは、運用管理者と開発者の全員に届きます。
      </p>
      <ul className="divide-y divide-gray-100">
        {candidates.map(c => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <Checkbox
              id={`ops-${c.id}`}
              checked={selected.has(c.id)}
              onCheckedChange={v => setSelected(prev => { const n = new Set(prev); if (v) n.add(c.id); else n.delete(c.id); return n })}
              disabled={isPending}
            />
            <label htmlFor={`ops-${c.id}`} className="flex-1 min-w-0 text-sm text-gray-800 cursor-pointer">
              {c.name}
              <span className="ml-2 text-[10px] text-gray-400">{c.label}</span>
            </label>
            <span className="text-[10px] text-gray-400 whitespace-nowrap">
              {c.hasEmail ? 'メール' : 'メールなし'}{c.hasLine ? '・LINE' : ''}
            </span>
          </li>
        ))}
        {candidates.length === 0 && <li className="py-2 text-xs text-gray-400">候補がいません（運用管理者・開発者・役員が対象）</li>}
      </ul>
      {updatedAt && (
        <p className="text-[10px] text-gray-400">最終変更: {fmt(updatedAt)}{updatedBy ? `（${updatedBy}）` : ''}</p>
      )}
    </div>
  )
}
