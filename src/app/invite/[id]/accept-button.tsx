'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserPlus, CheckCircle, AlertCircle, HelpCircle, UserCircle, MessageCircle } from 'lucide-react'
import { acceptInvitation } from '../actions'

interface Props {
  invitationId: string
  asManager?: boolean
  initialLastName: string
  initialFirstName: string
  previewMode?: boolean
}

// 日本語（漢字・ひらがな・カタカナ・半角/全角スペース・々・ー）のみ許可
// Unicode ranges:
//  - Hiragana: U+3040–U+309F
//  - Katakana: U+30A0–U+30FF
//  - CJK:      U+4E00–U+9FFF  U+3400–U+4DBF
//  - 々:        U+3005
//  - ー:        U+30FC
//  - 半角カナ:   U+FF65–U+FF9F
//  - 空白       半角/全角
const JP_NAME_REGEX = /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\u3005\u30FC\uFF65-\uFF9F\s\u3000]+$/
// アルファベット（半角）を含んでいたら誤登録の可能性大
const HAS_ALPHABET = /[A-Za-z]/

function isJapaneseName(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  return JP_NAME_REGEX.test(t)
}

export function AcceptInvitationButton({ invitationId, asManager = false, initialLastName, initialFirstName, previewMode = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [joined, setJoined] = useState<string | null>(null)
  const router = useRouter()
  const joinLabel = asManager ? 'リーダーとして参加' : 'このチームに参加'

  // 氏名（Google登録値で初期化）
  const [lastName, setLastName] = useState(initialLastName ?? '')
  const [firstName, setFirstName] = useState(initialFirstName ?? '')

  // プロフィール情報
  const [instagramUrl, setInstagramUrl] = useState('')
  const [lineUrl, setLineUrl] = useState('')

  // 確認方法ダイアログ
  const [helpDialog, setHelpDialog] = useState<'instagram' | 'line' | null>(null)

  // バリデーション
  const lastNameHasAlphabet = HAS_ALPHABET.test(lastName)
  const firstNameHasAlphabet = HAS_ALPHABET.test(firstName)
  const lastNameInvalid = !lastName.trim() || lastNameHasAlphabet || !isJapaneseName(lastName)
  const firstNameInvalid = !firstName.trim() || firstNameHasAlphabet || !isJapaneseName(firstName)
  const canSubmit = !lastNameInvalid && !firstNameInvalid

  const handleAccept = () => {
    if (!canSubmit) {
      toast.error('氏名を漢字・ひらがな・カタカナで入力してください')
      return
    }
    if (previewMode) {
      // プレビューモード: 実際には参加せず joined UI を表示
      setJoined('（プレビュー）このチーム')
      return
    }
    startTransition(async () => {
      const res = await acceptInvitation(invitationId, {
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        instagramUrl: instagramUrl.trim() || null,
        lineUrl: lineUrl.trim() || null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setJoined(res.teamName ?? '')
      toast.success('チームに参加しました')
    })
  }

  const handleLineLink = () => {
    if (previewMode) {
      alert('プレビューモードです。実際の招待からだと、ここでLINE連携画面に遷移します。')
      return
    }
    const baseUrl = window.location.origin
    const channelId = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
    if (!channelId) {
      toast.error('LINE Login が設定されていません')
      router.push('/')
      return
    }
    const redirectUri = encodeURIComponent(`${baseUrl}/auth/line/callback`)
    const state = crypto.randomUUID()
    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile`
  }

  if (joined) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">「{joined}」に{asManager ? 'リーダーとして' : ''}参加しました！</span>
        </div>

        {/* LINE連携の案内（参加直後・最終ステップ） */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-800">最後に、LINE連携をおすすめします</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                スキル認定の結果やリアクションが、LINEですぐ届くので、
                進捗がすぐにわかるようになります。約10秒で完了します。
              </p>
            </div>
          </div>
          <Button
            onClick={handleLineLink}
            className="w-full h-11 bg-green-500 hover:bg-green-600 font-medium"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            LINE連携する（推奨）
          </Button>
          <button
            onClick={() => {
              if (previewMode) {
                alert('プレビューモードです。実際の招待からだと、ここでダッシュボードに遷移します。')
                return
              }
              router.push('/')
            }}
            className="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-1"
          >
            あとで設定する（ダッシュボードへ）
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 氏名確認フォーム */}
      <div className="space-y-2 bg-orange-50/70 border border-orange-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5">
          <UserCircle className="w-4 h-4 text-orange-500" />
          <p className="text-xs font-bold text-gray-800">氏名のご確認（必須）</p>
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          漢字・ひらがな・カタカナで入力してください。<br />
          Googleアカウントの名前がアルファベットの場合は、日本語で書き直してください。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-0.5">姓</label>
            <Input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className={`h-9 text-sm ${lastNameInvalid && lastName ? 'border-red-400' : ''}`}
              placeholder="山田"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-0.5">名</label>
            <Input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className={`h-9 text-sm ${firstNameInvalid && firstName ? 'border-red-400' : ''}`}
              placeholder="太郎"
            />
          </div>
        </div>
        {(lastNameHasAlphabet || firstNameHasAlphabet) && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>アルファベットが含まれています。漢字・ひらがな・カタカナで入力してください。</span>
          </div>
        )}
      </div>

      {/* プロフィール情報（任意・推奨） */}
      <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-white/70">
        <div className="flex items-center gap-1.5">
          <UserCircle className="w-4 h-4 text-gray-500" />
          <p className="text-xs font-bold text-gray-800">プロフィール情報（任意・推奨）</p>
        </div>
        <p className="text-[10px] text-gray-500">後からMyページでも編集できます</p>

        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[10px] text-gray-500 font-medium">Instagram URL</label>
            <button
              type="button"
              onClick={() => setHelpDialog('instagram')}
              className="text-[10px] text-orange-600 hover:underline flex items-center gap-0.5"
            >
              <HelpCircle className="w-3 h-3" />確認方法
            </button>
          </div>
          <Input
            type="url"
            placeholder="https://instagram.com/..."
            value={instagramUrl}
            onChange={e => setInstagramUrl(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[10px] text-gray-500 font-medium">LINE URL</label>
            <button
              type="button"
              onClick={() => setHelpDialog('line')}
              className="text-[10px] text-orange-600 hover:underline flex items-center gap-0.5"
            >
              <HelpCircle className="w-3 h-3" />確認方法
            </button>
          </div>
          <Input
            type="url"
            placeholder="https://line.me/ti/p/..."
            value={lineUrl}
            onChange={e => setLineUrl(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* 参加ボタン */}
      <Button
        onClick={handleAccept}
        disabled={isPending || !canSubmit}
        className="w-full h-11 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300"
      >
        <UserPlus className="w-4 h-4 mr-2" />
        {isPending ? '参加処理中...' : `${joinLabel}する`}
      </Button>

      {/* 確認方法ダイアログ */}
      <Dialog open={helpDialog !== null} onOpenChange={v => { if (!v) setHelpDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-orange-500" />
              {helpDialog === 'instagram' ? 'Instagram URL の確認方法' : 'LINE URL の確認方法'}
            </DialogTitle>
          </DialogHeader>
          {helpDialog === 'instagram' && (
            <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
              <div>
                <p className="font-semibold text-gray-800 mb-1">📱 Instagramアプリから</p>
                <ol className="list-decimal pl-5 space-y-1 text-[13px]">
                  <li>Instagramアプリを開く</li>
                  <li>右下のプロフィールアイコンをタップ</li>
                  <li>右上のメニュー（≡）→「QRコード」</li>
                  <li>下部の「シェア」→「リンクをコピー」</li>
                </ol>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">💻 Webブラウザから</p>
                <p className="text-[13px]">
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">https://instagram.com/ユーザー名</code>
                </p>
              </div>
            </div>
          )}
          {helpDialog === 'line' && (
            <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
              <div>
                <p className="font-semibold text-gray-800 mb-1">📱 LINEアプリから（自分のプロフィール共有URL）</p>
                <ol className="list-decimal pl-5 space-y-1 text-[13px]">
                  <li>LINEアプリを開く</li>
                  <li>ホーム → 自分のプロフィール画像をタップ</li>
                  <li>右上の「シェア」アイコン</li>
                  <li>「URLをコピー」または「ほかのアプリで開く」</li>
                </ol>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-[12px] text-gray-600">
                コピーしたURLは <code className="bg-white px-1 rounded text-[10px]">https://line.me/ti/p/...</code> の形式です
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
