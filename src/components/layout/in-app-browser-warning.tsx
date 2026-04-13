'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Copy, X } from 'lucide-react'
import { toast } from 'sonner'

/**
 * LINE等のアプリ内ブラウザを検知して、外部ブラウザで開くよう促すバナー。
 * GoogleのOAuthが "disallowed_useragent" エラーで弾かれるのを防ぐ。
 */
export function InAppBrowserWarning() {
  const [detected, setDetected] = useState<'line' | 'other' | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')

  useEffect(() => {
    const ua = navigator.userAgent || ''
    // LINE: "Line/" を含む
    if (/Line\//i.test(ua)) {
      setDetected('line')
    } else if (/FBAN|FBAV|Instagram|Twitter|MicroMessenger/i.test(ua)) {
      // Facebook / Instagram / Twitter / WeChat 等
      setDetected('other')
    }
    setCurrentUrl(window.location.href)
  }, [])

  if (!detected || dismissed) return null

  const openExternal = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('openExternalBrowser', '1')
    // LINE内ブラウザで openExternalBrowser=1 付きURLに遷移させると、
    // LINEが外部ブラウザ（Safari/Chrome）で開き直してくれる
    window.location.href = url.toString()
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl)
      toast.success('URLをコピーしました。Safari/Chromeで貼り付けてください')
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden">
        <div className="bg-gradient-to-br from-orange-400 to-red-500 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              <h2 className="text-base font-bold">外部ブラウザで開いてください</h2>
            </div>
            <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-gray-700">
          <p>
            {detected === 'line' ? 'LINE内ブラウザ' : 'アプリ内ブラウザ'}
            ではGoogleログインができません。
          </p>
          <p>下のボタンで Safari/Chrome などの外部ブラウザで開いてください。</p>

          {detected === 'line' ? (
            <button
              onClick={openExternal}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              外部ブラウザで開く
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">右上のメニューから「ブラウザで開く」を選択するか、下のボタンでURLをコピーしてSafari/Chromeに貼り付けてください。</p>
              <button
                onClick={copyUrl}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                URLをコピー
              </button>
            </div>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
          >
            一旦閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
