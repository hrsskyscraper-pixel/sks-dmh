'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertCircle, UserPlus } from 'lucide-react'
import { adminCompleteJoin } from '@/app/(dashboard)/join-completion-actions'

interface Member {
  id: string
  name: string
  avatar_url: string | null
  requested_team_id: string | null
  created_at: string
}

interface Props {
  members: Member[]
  teamMap: Record<string, { id: string; name: string; type?: string; prefecture?: string | null }>
}

/**
 * 承認済みだが所属0の人（招待リンクで「参加する」を押さず離脱）の一覧。
 * 承認者が参加予定の店舗へ手動で追加できる。
 */
export function UnjoinedMembersCard({ members, teamMap }: Props) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (members.length === 0) return null

  const handleAdd = (id: string) => {
    setPendingId(id)
    startTransition(async () => {
      const res = await adminCompleteJoin(id)
      setPendingId(null)
      if (res.error) { toast.error(res.error); return }
      toast.success(`「${res.teamName ?? ''}」に追加しました`)
      router.refresh()
    })
  }

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-bold text-gray-800">未参加（承認済み・所属なし）</p>
          <span className="text-xs text-amber-600 font-medium">{members.length}</span>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          ログイン済みですが「参加する」を押さず、まだ店舗に登録されていない方です。
          参加予定の店舗へ追加できます（本人がバナーから完了することもできます）。
        </p>
        <div className="space-y-2">
          {members.map(m => {
            const teamName = m.requested_team_id ? teamMap[m.requested_team_id]?.name ?? '不明' : '未設定'
            return (
              <div key={m.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarImage src={m.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{m.name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">参加予定: {teamName}</p>
                </div>
                <Button
                  size="sm"
                  className="h-8 px-2.5 text-xs bg-orange-500 hover:bg-orange-600 flex-shrink-0"
                  disabled={isPending && pendingId === m.id}
                  onClick={() => handleAdd(m.id)}
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  {isPending && pendingId === m.id ? '追加中...' : '所属に追加'}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
