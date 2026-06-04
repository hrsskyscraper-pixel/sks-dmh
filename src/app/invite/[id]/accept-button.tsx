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
import { UserPlus, CheckCircle, AlertCircle, HelpCircle, UserCircle, MessageCircle, Search, Building2 } from 'lucide-react'
import { acceptInvitation, acceptSelfSelectInvitation } from '../actions'
import { buildLineLoginAuthorizeUrl } from '@/lib/line-login'

const TEAM_TYPE_LABEL: Record<string, string> = { store: '店舗', department: '部署', project: 'チーム' }
const TEAM_TYPE_BADGE: Record<string, string> = {
  store: 'bg-blue-100 text-blue-700',
  department: 'bg-purple-100 text-purple-700',
  project: 'bg-violet-100 text-violet-700',
}

type TeamOption = { id: string; name: string; type: string; prefecture: string | null }

interface Props {
  invitationId: string
  asManager?: boolean
  initialLastName: string
  initialFirstName: string
  previewMode?: boolean
  /** 自己選択型リンク: 参加者が所属を選んで参加する */
  selfSelect?: boolean
  /** 自己選択型で選択可能な所属一覧 */
  teams?: TeamOption[]
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

export function AcceptInvitationButton({ invitationId, asManager = false, initialLastName, initialFirstName, previewMode = false, selfSelect = false, teams = [] }: Props) {
  const [isPending, startTransition] = useTransition()
  const [joined, setJoined] = useState<string | null>(null)
  const router = useRouter()
  const joinLabel = asManager ? 'リーダーとして参加' : 'このチームに参加'

  // 自己選択型: 参加先の所属
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [teamSearch, setTeamSearch] = useState('')

  // 氏名（Google登録値で初期化）
  const [lastName, setLastName] = useState(initialLastName ?? '')
  const [firstName, setFirstName] = useState(initialFirstName ?? '')
  const [lastNameKana, setLastNameKana] = useState('')
  const [firstNameKana, setFirstNameKana] = useState('')

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
  // ふりがなも必須・日本語のみ
  const lastNameKanaHasAlphabet = HAS_ALPHABET.test(lastNameKana)
  const firstNameKanaHasAlphabet = HAS_ALPHABET.test(firstNameKana)
  const lastNameKanaInvalid = !lastNameKana.trim() || lastNameKanaHasAlphabet || !isJapaneseName(lastNameKana)
  const firstNameKanaInvalid = !firstNameKana.trim() || firstNameKanaHasAlphabet || !isJapaneseName(firstNameKana)
  const canSubmit = !lastNameInvalid && !firstNameInvalid && !lastNameKanaInvalid && !firstNameKanaInvalid && (!selfSelect || !!selectedTeamId)

  // 自己選択型の所属候補（検索＋並び替え）
  const filteredTeams = teams
    .filter(t => {
      const q = teamSearch.trim().toLowerCase()
      if (!q) return true
      return t.name.toLowerCase().includes(q) || (t.prefecture ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const order: Record<string, number> = { store: 0, department: 1, project: 2 }
      const oa = order[a.type] ?? 9, ob = order[b.type] ?? 9
      if (oa !== ob) return oa - ob
      const pa = a.prefecture ?? '', pb = b.prefecture ?? ''
      if (pa !== pb) return pa.localeCompare(pb, 'ja')
      return a.name.localeCompare(b.name, 'ja')
    })

  const handleAccept = () => {
    if (selfSelect && !selectedTeamId) {
      toast.error('参加する所属（店舗・部署・チーム）を選択してください')
      return
    }
    if (!canSubmit) {
      toast.error('氏名・ふりがなを漢字・ひらがな・カタカナで入力してください')
      return
    }
    if (previewMode) {
      // プレビューモード: 実際には参加せず joined UI を表示
      setJoined('（プレビュー）このチーム')
      return
    }
    startTransition(async () => {
      const kana = [lastNameKana.trim(), firstNameKana.trim()].filter(Boolean).join(' ')
      const profile = {
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        nameKana: kana || null,
        instagramUrl: instagramUrl.trim() || null,
        lineUrl: lineUrl.trim() || null,
      }
      const res = selfSelect
        ? await acceptSelfSelectInvitation(invitationId, selectedTeamId, profile)
        : await acceptInvitation(invitationId, profile)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setJoined(res.teamName ?? '')
      toast.success('参加しました')
    })
  }

  const handleLineLink = () => {
    if (previewMode) {
      alert('プレビューモードです。実際の招待からだと、ここでLINE連携画面に遷移します。')
      return
    }
    const baseUrl = window.location.origin
    const url = buildLineLoginAuthorizeUrl(baseUrl)
    if (!url) {
      toast.error('LINE Login が設定されていません')
      router.push('/')
      return
    }
    window.location.href = url
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
      {/* 所属選択（自己選択型リンクのみ） */}
      {selfSelect && (
        <div className="space-y-2 bg-blue-50/70 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-bold text-gray-800">所属の選択（必須）</p>
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            ご自身が{asManager ? '担当リーダー' : 'メンバー'}として参加する所属（店舗・部署・チーム）を選んでください。
          </p>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={teamSearch}
              onChange={e => setTeamSearch(e.target.value)}
              placeholder="店舗名・都道府県などで検索"
              className="h-9 text-sm pl-7"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
            {filteredTeams.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-3 text-center">該当する所属がありません</p>
            )}
            {filteredTeams.map(t => (
              <label
                key={t.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${selectedTeamId === t.id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
              >
                <input
                  type="radio"
                  name="self-select-team"
                  checked={selectedTeamId === t.id}
                  onChange={() => setSelectedTeamId(t.id)}
                  className="accent-orange-500 flex-shrink-0"
                />
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${TEAM_TYPE_BADGE[t.type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {TEAM_TYPE_LABEL[t.type] ?? t.type}
                </span>
                <span className="text-sm text-gray-800 truncate flex-1">{t.name}</span>
                {t.prefecture && <span className="text-[10px] text-gray-400 flex-shrink-0">{t.prefecture}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-0.5">せい（ふりがな）</label>
            <Input
              value={lastNameKana}
              onChange={e => setLastNameKana(e.target.value)}
              className={`h-9 text-sm ${lastNameKanaInvalid ? 'border-red-400' : ''}`}
              placeholder="やまだ"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-0.5">めい（ふりがな）</label>
            <Input
              value={firstNameKana}
              onChange={e => setFirstNameKana(e.target.value)}
              className={`h-9 text-sm ${firstNameKanaInvalid ? 'border-red-400' : ''}`}
              placeholder="たろう"
            />
          </div>
        </div>
        {(lastNameHasAlphabet || firstNameHasAlphabet || lastNameKanaHasAlphabet || firstNameKanaHasAlphabet) && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>アルファベットが含まれています。漢字・ひらがな・カタカナで入力してください。</span>
          </div>
        )}
      </div>

      {/* SNSリンク */}
      <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-white/70">
        <div className="flex items-center gap-1.5">
          <UserCircle className="w-4 h-4 text-gray-500" />
          <p className="text-xs font-bold text-gray-800">SNSリンク</p>
        </div>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          チームメンバーとの相互理解に役立てましょう。<br />
          プロフィールにSNSアイコンが表示されるようになります。<br />
          後からMyページでも編集できます。
        </p>

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
