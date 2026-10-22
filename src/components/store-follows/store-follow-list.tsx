'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { setStoreFollow } from '@/app/(dashboard)/store-follows/actions'

export type StoreFollowGroup = {
  name: string
  stores: { id: string; name: string; isMember: boolean; on: boolean }[]
}

/** 店舗ごとの「級の取得を知らせる」チェック。押した瞬間に保存し、失敗したら元に戻す（戻せる操作なので確認は挟まない） */
export function StoreFollowList({ groups }: { groups: StoreFollowGroup[] }) {
  const [on, setOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(groups.flatMap(g => g.stores.map(s => [s.id, s.on]))),
  )
  const [, startTransition] = useTransition()
  // 続けて押したとき、古い保存の結果で表示を戻さないよう、店舗ごとに最後の操作だけを見る
  const seq = useRef<Record<string, number>>({})

  const toggle = (id: string, next: boolean) => {
    const mine = (seq.current[id] = (seq.current[id] ?? 0) + 1)
    setOn(prev => ({ ...prev, [id]: next }))
    startTransition(async () => {
      const res = await setStoreFollow(id, next)
      if (res.error && seq.current[id] === mine) {
        setOn(prev => ({ ...prev, [id]: !next }))
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <Card key={g.name}>
          <CardContent className="py-3 px-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              {g.name}
              <span className="ml-1 font-normal text-gray-400">（{g.stores.filter(s => on[s.id]).length}/{g.stores.length}）</span>
            </p>
            <ul className="space-y-1">
              {g.stores.map(s => (
                <li key={s.id}>
                  <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                    <Checkbox checked={!!on[s.id]} onCheckedChange={v => toggle(s.id, v === true)} />
                    <span className="text-sm text-gray-800">{s.name}</span>
                    {s.isMember && <span className="text-[10px] text-sky-700 bg-sky-100 rounded px-1.5 py-0.5">所属</span>}
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
