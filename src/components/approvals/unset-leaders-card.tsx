'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { grantLeaderPermission } from '@/app/(dashboard)/admin/business-roles/actions'

interface Leader {
  id: string
  name: string
  avatar_url: string | null
  teamNames: string[]
}

interface Props {
  leaders: Leader[]
}

/**
 * チームのリーダー(team_managers)に登録されているのに、システム権限が「メンバー」のままで
 * 承認できない人の一覧（再発防止）。運用管理者がワンクリックで「リーダー権限」を付与できる。
 * 招待は全員メンバー権限で始まり権限は手動付与のため、上げ忘れをここで検知・解消する。
 */
export function UnsetLeadersCard({ leaders }: Props) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (leaders.length === 0) return null

  const grant = (id: string) => {
    setPendingId(id)
    startTransition(async () => {
      const res = await grantLeaderPermission(id)
      setPendingId(null)
      if (res.error) { toast.error(res.error); return }
      toast.success('リーダー権限を付与しました')
      router.refresh()
    })
  }

  const grantAll = () => {
    setPendingId('__all__')
    startTransition(async () => {
      let ok = 0
      for (const l of leaders) {
        const res = await grantLeaderPermission(l.id)
        if (!res.error) ok++
      }
      setPendingId(null)
      toast.success(`${ok}名にリーダー権限を付与しました`)
      router.refresh()
    })
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-indigo-500" />
          <p className="text-sm font-bold text-gray-800">承認権限が未設定のリーダー</p>
          <span className="text-xs text-indigo-600 font-medium">{leaders.length}</span>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          チームのリーダーに登録されていますが、システム権限が「メンバー」のままで承認センターを使えません。
          「リーダー権限」を付与すると、担当チームのスキル申請・参加を承認できるようになります。
        </p>
        {leaders.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-100"
            disabled={isPending}
            onClick={grantAll}
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            {pendingId === '__all__' ? '付与中...' : `全員（${leaders.length}名）にリーダー権限を付与`}
          </Button>
        )}
        <div className="space-y-2">
          {leaders.map(l => (
            <div key={l.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
              <CertRingAvatar employeeId={l.id} src={l.avatar_url} name={l.name} size={32} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{l.name}</p>
                <p className="text-[11px] text-gray-500 truncate">リーダー: {l.teamNames.join('・') || '—'}</p>
              </div>
              <Button
                size="sm"
                className="h-8 px-2.5 text-xs bg-indigo-500 hover:bg-indigo-600 flex-shrink-0"
                disabled={isPending && pendingId === l.id}
                onClick={() => grant(l.id)}
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                {isPending && pendingId === l.id ? '付与中...' : 'リーダー権限を付与'}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
