'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LogOut, DoorOpen } from 'lucide-react'

/** 退職日を過ぎたアカウントの画面。アプリには入れない（2026-09-20 決定）。 */
export function LeftScreen({ leftAt }: { leftAt: string }) {
  const router = useRouter()
  const handleLogout = async () => {
    await createClient().auth.signOut()
    router.push('/login')
  }
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
            <DoorOpen className="w-6 h-6 text-gray-500" />
          </div>
          <CardTitle className="text-lg">このアカウントは利用を終了しています</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-gray-600">退職日（{leftAt}）以降は Mission Board をご利用いただけません。これまでのご活躍、ありがとうございました。</p>
          <p className="text-xs text-gray-500">お心当たりがない場合は、店舗の責任者または運用管理者にご連絡ください。</p>
          <Button variant="outline" onClick={handleLogout} className="w-full"><LogOut className="w-4 h-4 mr-2" />ログアウト</Button>
        </CardContent>
      </Card>
    </div>
  )
}
