'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LINE_OA_FRIEND_ADD_URL } from '@/lib/line-login'

export function LineLinkToast() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const linked = searchParams.get('line_linked')
    const error = searchParams.get('line_error')

    if (linked === 'true') {
      toast.success('LINE連携が完了しました', {
        description: '参加依頼の承認通知や、スキル認定の結果などをLINEでお知らせします。',
        duration: 6000,
      })
      // URLからパラメータを除去
      router.replace('/', { scroll: false })
    } else if (linked === 'nofriend') {
      toast.warning('あと一歩でLINE通知が届きます', {
        description: '下のボタンから公式アカウント「Growth Driver」を友だち追加してから、ダッシュボード上部のバナーで「② 確認する」を押してください。',
        duration: 14000,
        action: {
          label: 'LINEで友だち追加',
          onClick: () => window.open(LINE_OA_FRIEND_ADD_URL, '_blank', 'noopener,noreferrer'),
        },
      })
      router.replace('/', { scroll: false })
    } else if (error) {
      const messages: Record<string, string> = {
        token_failed: 'LINEの認証に失敗しました。もう一度お試しください。',
        profile_failed: 'LINEのプロフィール取得に失敗しました。',
        save_failed: 'LINE連携の保存に失敗しました。もう一度お試しください。',
        no_code: 'LINE連携がキャンセルされました。',
      }
      toast.error('LINE連携に失敗しました', {
        description: messages[error] ?? 'エラーが発生しました。もう一度お試しください。',
        duration: 6000,
      })
      router.replace('/', { scroll: false })
    }
  }, [searchParams, router])

  return null
}
