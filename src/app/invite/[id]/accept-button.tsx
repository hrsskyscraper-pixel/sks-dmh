'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UserPlus, CheckCircle } from 'lucide-react'
import { acceptInvitation } from '../actions'

export function AcceptInvitationButton({ invitationId, asManager = false }: { invitationId: string; asManager?: boolean }) {
  const joinLabel = asManager ? 'リーダー（副）として参加' : 'このチームに参加'
  const [isPending, startTransition] = useTransition()
  const [joined, setJoined] = useState<string | null>(null)
  const router = useRouter()

  const handleAccept = () => {
    startTransition(async () => {
      // welcome画面で入力されたプロフィール情報を localStorage から読み取る
      let profile: {
        birthDate?: string | null
        hireDate?: string | null
        instagramUrl?: string | null
        lineUrl?: string | null
      } | undefined
      try {
        const raw = localStorage.getItem(`invite-profile-${invitationId}`)
        if (raw) profile = JSON.parse(raw)
      } catch { /* ignore */ }

      const res = await acceptInvitation(invitationId, profile)
      if (res.error) {
        toast.error(res.error)
        return
      }
      // 使い終わった localStorage をクリア
      try { localStorage.removeItem(`invite-profile-${invitationId}`) } catch { /* ignore */ }
      setJoined(res.teamName ?? '')
      toast.success('チームに参加しました')
      setTimeout(() => router.push('/'), 1500)
    })
  }

  if (joined) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm">「{joined}」に{asManager ? 'リーダー（副）として' : ''}参加しました</span>
      </div>
    )
  }

  return (
    <Button
      onClick={handleAccept}
      disabled={isPending}
      className="w-full h-11 bg-orange-500 hover:bg-orange-600"
    >
      <UserPlus className="w-4 h-4 mr-2" />
      {isPending ? '参加処理中...' : `${joinLabel}する`}
    </Button>
  )
}
