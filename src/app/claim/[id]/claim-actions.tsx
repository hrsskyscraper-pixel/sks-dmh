'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { claimAccount, rejectClaim } from '../actions'

/**
 * 本人用のログインリンクの操作。
 * 未ログイン: Google アカウントが必要なことを案内してログイン ／ ログイン済み: 内容を確かめて「この内容で参加します」
 */
export function ClaimActions({ claimId, name, loggedInEmail }: { claimId: string; name: string; loggedInEmail: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [wrong, setWrong] = useState(false)
  const [error, setError] = useState('')

  const login = async () => {
    const supabase = createClient()
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`)
    callbackUrl.searchParams.set('next', `/claim/${claimId}`)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl.toString() } })
  }
  const switchAccount = async () => {
    await createClient().auth.signOut()
    window.location.reload()
  }

  if (!loggedInEmail) {
    return (
      <>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1.5">
          <p className="font-semibold text-gray-800">参加には Google アカウントが必要です</p>
          <p>次の画面で、Google アカウントでログインしてください。</p>
          <p>ふだん使っている Google アカウントを使いたくない場合は、Mission Board 用に新しい Google アカウントを作ってから参加してください（Google のログイン画面の「アカウントを作成」から作れます）。</p>
          <p>一度つないだ Google アカウントで、次からもログインします。</p>
        </div>
        <Button className="w-full" onClick={login}>Google でログイン</Button>
        <p className="text-[11px] text-gray-500">このリンクは {name} さん専用です。ほかの方には渡さないでください。</p>
      </>
    )
  }
  if (wrong) {
    return (
      <>
        <p className="text-sm text-gray-700">このリンクは止めました。店長か運用管理者に「内容が違う（または、ほかの方のリンクだった）」と伝えて、正しいリンクをお願いしてください。</p>
        <Button variant="outline" className="w-full" onClick={switchAccount}>ログアウトする</Button>
      </>
    )
  }
  return (
    <>
      <p className="text-sm text-gray-700">上の内容が、あなた（<span className="font-semibold">{name}</span> さん）のものか確かめてください。</p>
      <p className="text-[11px] text-gray-500">いまログインしている Google アカウント（{loggedInEmail}）で参加します。次からも、この Google アカウントでログインします。</p>
      <Button className="w-full" disabled={isPending} onClick={() => startTransition(async () => {
        const res = await claimAccount(claimId)
        if (res.error) { setError(res.error); return }
        window.location.href = `${window.location.origin}/`
      })}>
        この内容で参加します
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button variant="outline" className="w-full" disabled={isPending} onClick={() => startTransition(async () => { await rejectClaim(claimId); setWrong(true) })}>内容が違う・私ではない（リンクを止める）</Button>
      <button type="button" className="w-full text-[11px] text-gray-500 underline" onClick={switchAccount}>別の Google アカウントでログインし直す</button>
    </>
  )
}
