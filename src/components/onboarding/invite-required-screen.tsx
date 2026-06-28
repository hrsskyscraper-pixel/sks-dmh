'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'

/**
 * 招待リンク経由でしか初回登録できない方針のため、employees レコードが無い
 * （＝未招待でログインした）ユーザーに表示する案内画面。アプリには入れない。
 */
export function InviteRequiredScreen({ email }: { email: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const signOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-2">
            <Mail className="w-6 h-6 text-orange-500" />
          </div>
          <CardTitle className="text-lg">招待が必要です</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          <p className="text-sm text-gray-600">
            Mission Board のご利用には、担当者からの<span className="font-medium text-orange-600">招待リンク</span>が必要です。
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            お手元の招待リンクを開いて参加手続きを行ってください。招待リンクが無い場合は、
            所属先の管理者・運営管理者にお問い合わせください。
          </p>
          {email && <p className="text-[11px] text-gray-400">ログイン中: {email}</p>}
          <Button variant="outline" className="w-full" onClick={signOut} disabled={loading}>
            {loading ? '切り替え中...' : '別のアカウントでログイン'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
