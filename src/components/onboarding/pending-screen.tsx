'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, LogOut, Mail } from 'lucide-react'

interface Props {
  email: string
  teamName: string
  systemUrl: string
}

export function PendingScreen({ email, teamName, systemUrl }: Props) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-3">
            <Clock className="w-6 h-6 text-orange-500" />
          </div>
          <CardTitle className="text-lg">参加依頼を送信しました</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-gray-600">
            <p>管理者に参加依頼を送信しました。</p>
            <p>管理者の確認が完了すると、</p>
            <p className="flex items-center gap-1.5">
              <Mail className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium text-gray-800">{email}</span>
            </p>
            <p>に、確認完了のメールが送信されます。</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700 space-y-2">
            <p>確認完了メールを受信後、システムがご利用可能となります。</p>
            <p>その後、改めてログインしてください。</p>
            <p className="text-xs text-blue-500 break-all">{systemUrl}</p>
          </div>

          <div className="text-xs text-gray-400 text-center">
            希望店舗: {teamName}
          </div>

          <Button variant="outline" onClick={handleLogout} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            ログアウト
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
