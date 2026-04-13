'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  CheckCircle2,
  MessageCircle,
  Users,
  Shield,
  ShieldCheck,
  Info,
  LogIn,
  ExternalLink,
  ChevronDown,
  Mail,
} from 'lucide-react'

interface Props {
  invitationId: string
  inviterName: string
  teamName: string
  projectTeamName?: string
  customMessage?: string
  asManager: boolean
  previewMode?: boolean
}

export function WelcomeContent({
  invitationId,
  inviterName,
  teamName,
  projectTeamName,
  customMessage,
  asManager,
  previewMode = false,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [showGoogleHelp, setShowGoogleHelp] = useState(false)

  const handleGoogleLogin = async () => {
    if (previewMode) {
      // プレビュー継続: 次のステップ（氏名確認・参加画面）を表示
      window.location.href = `/invite/${invitationId}?preview=1&step=accept`
      return
    }
    setLoading(true)
    const supabase = createClient()
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`)
    callbackUrl.searchParams.set('next', `/invite/${invitationId}`)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    })
  }

  const joinLabel = asManager ? 'リーダー（副）' : 'メンバー'
  const accentColor = asManager ? 'from-amber-400 to-orange-500' : 'from-orange-400 to-red-500'

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {previewMode && (
        <div className="bg-yellow-400 text-yellow-900 text-center py-1.5 text-xs font-semibold">
          🔍 プレビューモード — 招待先の方に見えるページです（ログインは動作しません）
        </div>
      )}
      <div className="max-w-md mx-auto p-4 space-y-4 pb-8">
        {/* ヘッダー */}
        <div className={`bg-gradient-to-br ${accentColor} rounded-2xl p-5 text-white shadow-lg`}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-xs font-medium opacity-90">Growth Driver へようこそ</span>
          </div>
          <h1 className="text-xl font-bold leading-tight mb-1">
            {inviterName}さんから<br />
            <span className="inline-block mt-1">「{teamName}」への</span><br />
            <span className="inline-block">{joinLabel}参加のご招待です</span>
          </h1>
          {projectTeamName && (
            <p className="text-sm opacity-90 mt-2">
              所属チーム: {projectTeamName}
            </p>
          )}
        </div>

        {/* 招待者からのメッセージ */}
        {customMessage && (
          <Card className="border-orange-200 bg-white/90">
            <CardContent className="py-3 px-4">
              <p className="text-[10px] text-orange-600 font-medium mb-1">{inviterName}さんからのメッセージ</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{customMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Growth Driverとは */}
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-orange-500" />
              Growth Driver とは
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong className="text-orange-600">「GAPから、次の一歩へ。」</strong><br />
              お仕事のスキル習得の進み具合を"見える化"して、
              一人ひとりの成長をチーム全員で応援するアプリです。
            </p>
            <div className="space-y-1.5 text-sm text-gray-700">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>自分が今、どこまでできているか一目でわかる</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>できるようになったことを申請 → 先輩・店長が認定</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>認定されるとチームからスタンプやコメントが届く</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 参加後にできること */}
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              {asManager ? <ShieldCheck className="w-4 h-4 text-amber-500" /> : <Users className="w-4 h-4 text-blue-500" />}
              参加後にできること
            </h2>
            {asManager ? (
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>自分のスキル申請・進捗管理</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>チームメンバーのスキル認定・差し戻し</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>チーム全体の進捗ランキング閲覧</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>メンバーへの招待発行</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>タイムラインで応援・祝福・感謝を交換</span></li>
              </ul>
            ) : (
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>自分のスキル習得を申請</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>認定結果をタイムラインで確認</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>自分の進捗の&quot;順調？遅れてる？&quot;がわかる</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>仲間の頑張り・進捗が見える</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /><span>タイムラインで応援・祝福・感謝を交換</span></li>
              </ul>
            )}
          </CardContent>
        </Card>

        {/* LINE連携 */}
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="py-4 px-4 space-y-2">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              LINE連携がおすすめです
            </h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              参加後に LINE を連携すると、大事なお知らせが LINE に届くので、進捗がすぐにわかるようになります。
            </p>
            {asManager ? (
              <ul className="space-y-1 text-xs text-gray-700">
                <li>📥 メンバーからスキル認定の申請が届いたとき</li>
                <li>🙌 自分のスキルが認定されたとき</li>
                <li>👥 新しいメンバー参加の承認依頼</li>
                <li>💬 タイムラインへのリアクション・コメント</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-xs text-gray-700">
                <li>🙌 申請したスキルが認定されたとき</li>
                <li>📝 申請が差し戻されたとき</li>
                <li>💬 タイムラインへのリアクション・コメント</li>
                <li>🎉 チームからの招待・お知らせ</li>
              </ul>
            )}
          </CardContent>
        </Card>


        {/* 参加方法 */}
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="py-4 px-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <LogIn className="w-4 h-4 text-orange-500" />
              参加方法（3ステップ）
            </h2>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">1</span>
                <span>下の「<strong>Googleでログインして参加</strong>」をタップ</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">2</span>
                <span>ご自身のGoogleアカウントでログイン</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>「参加する」ボタンで完了！すぐ使えます</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* なぜ個人アカウントが必要か */}
        <Card className="border-blue-100 bg-blue-50/30">
          <CardContent className="py-3 px-4 space-y-2">
            <h2 className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              個人アカウントが必要な理由
            </h2>
            <p className="text-xs text-blue-800 leading-relaxed">
              スキル認定の申請や承認は、「誰がいつ行ったか」の記録が大切です。
              そのため、<strong>お一人ずつ個別のGoogleアカウント</strong>でご参加ください。
            </p>
          </CardContent>
        </Card>

        {/* Googleアカウントを持っていない場合 */}
        <div>
          <button
            onClick={() => setShowGoogleHelp(!showGoogleHelp)}
            className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 px-1 py-1"
          >
            <span>Googleアカウントを持っていない方はこちら</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showGoogleHelp ? 'rotate-180' : ''}`} />
          </button>
          {showGoogleHelp && (
            <Card className="mt-1">
              <CardContent className="py-3 px-4 space-y-2 text-xs text-gray-700">
                <p>Googleアカウントは無料で作成できます。下のリンクから作成後、改めて招待リンクを開いてご参加ください。</p>
                <a
                  href="https://accounts.google.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-orange-600 hover:underline font-medium"
                >
                  <ExternalLink className="w-3 h-3" />
                  Googleアカウントを作成する
                </a>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 注意事項 */}
        <Card className="border-red-100 bg-red-50/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-800 mb-1">このお知らせ文は転送しないでください</p>
                <p className="text-xs text-red-700 leading-relaxed">
                  この招待リンクは「{asManager ? 'リーダー' : 'メンバー'}として」あなた宛てに発行されています。
                  他の方に転送すると、意図しないロールで参加されてしまう場合があります。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA ボタン */}
        <div className="sticky bottom-2 z-10">
          <Button
            onClick={handleGoogleLogin}
            disabled={loading}
            className={`w-full h-14 text-base font-bold shadow-lg bg-gradient-to-br ${accentColor} hover:opacity-90 text-white`}
          >
            {loading ? (
              'ログイン中...'
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.9"/>
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.7"/>
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.8"/>
                </svg>
                Googleでログインして参加
              </>
            )}
          </Button>
          <p className="text-center text-[10px] text-gray-500 mt-1">
            ログイン後、ワンタップで「{teamName}」に参加できます
          </p>
        </div>

      </div>
    </div>
  )
}
