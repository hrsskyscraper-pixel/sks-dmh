'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw, Home } from 'lucide-react'

/**
 * (dashboard) セグメントのエラーバウンダリ。
 * 配下ページの描画中に未捕捉エラーが起きても、白い「Application error」画面に
 * せず、再読み込み導線付きの親切な表示にフォールバックする。
 * （レイアウト = BottomNav は維持され、コンテンツ領域だけがこの表示に置き換わる）
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 原因調査用にコンソールへ出力（本番では digest が手掛かりになる）
    console.error('DashboardError boundary caught:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-orange-50">
        <AlertTriangle className="w-7 h-7 text-orange-500" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-gray-800">問題が発生しました</p>
        <p className="text-sm text-gray-500">
          ページの読み込み中にエラーが発生しました。お手数ですが、もう一度お試しください。
        </p>
        {error.digest && (
          <p className="text-[10px] text-gray-300 mt-1">エラーID: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
        >
          <RotateCw className="w-4 h-4" />
          再読み込み
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
        >
          <Home className="w-4 h-4" />
          ホームに戻る
        </Link>
      </div>
    </div>
  )
}
