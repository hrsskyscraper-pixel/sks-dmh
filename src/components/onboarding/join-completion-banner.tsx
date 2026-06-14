'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { completeTeamJoin } from '@/app/(dashboard)/join-completion-actions'

// 日本語（漢字・ひらがな・カタカナ等）のみ許可。アルファベット混入は誤登録の可能性大。
const JP_NAME_REGEX = /^[぀-ゟ゠-ヿ一-鿿㐀-䶿々ー･-ﾟ\s　]+$/
const HAS_ALPHABET = /[A-Za-z]/
const isJp = (s: string) => { const t = s.trim(); return !!t && JP_NAME_REGEX.test(t) }

interface Props {
  teamName: string
  defaultLastName: string
  defaultFirstName: string
  defaultNameKana: string | null
}

/**
 * 「承認済みだが所属0」の人に、参加完了を促す常時バナー＋完了フォーム。
 * 招待リンクから「参加する」を押さず離脱した人を救済する。
 */
export function JoinCompletionBanner({ teamName, defaultLastName, defaultFirstName, defaultNameKana }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const kanaParts = (defaultNameKana ?? '').split(/\s+/).filter(Boolean)
  const [lastName, setLastName] = useState(defaultLastName ?? '')
  const [firstName, setFirstName] = useState(defaultFirstName ?? '')
  const [lastNameKana, setLastNameKana] = useState(kanaParts[0] ?? '')
  const [firstNameKana, setFirstNameKana] = useState(kanaParts.slice(1).join(' ') ?? '')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [lineUrl, setLineUrl] = useState('')

  const hasAlpha = HAS_ALPHABET.test(lastName + firstName + lastNameKana + firstNameKana)
  const canSubmit = isJp(lastName) && isJp(firstName) && isJp(lastNameKana) && isJp(firstNameKana)

  const handleSubmit = () => {
    if (!canSubmit) {
      toast.error('氏名・ふりがなを漢字・ひらがな・カタカナで入力してください')
      return
    }
    startTransition(async () => {
      const kana = [lastNameKana.trim(), firstNameKana.trim()].filter(Boolean).join(' ')
      const res = await completeTeamJoin({
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        nameKana: kana || null,
        instagramUrl: instagramUrl.trim() || null,
        lineUrl: lineUrl.trim() || null,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success(`「${res.teamName ?? teamName}」に参加しました！`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="bg-orange-50 border-b border-orange-200 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <p className="text-xs text-orange-800 flex-1 leading-snug">
            <span className="font-bold">あと一歩！</span>「{teamName}」への参加がまだ完了していません。
          </p>
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs bg-orange-500 hover:bg-orange-600 flex-shrink-0"
            onClick={() => setOpen(true)}
          >
            参加を完了する
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>「{teamName}」への参加を完了する</DialogTitle>
            <DialogDescription>
              氏名とふりがなをご確認のうえ、参加を完了してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-0.5">姓</label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="山田" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-0.5">名</label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="太郎" className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-0.5">せい（ふりがな）</label>
                <Input value={lastNameKana} onChange={e => setLastNameKana(e.target.value)} placeholder="やまだ" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-0.5">めい（ふりがな）</label>
                <Input value={firstNameKana} onChange={e => setFirstNameKana(e.target.value)} placeholder="たろう" className="h-9 text-sm" />
              </div>
            </div>
            {hasAlpha && (
              <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>アルファベットが含まれています。漢字・ひらがな・カタカナで入力してください。</span>
              </div>
            )}

            <div className="space-y-2 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] text-gray-500">SNSリンク（任意・後からMyページでも編集できます）</p>
              <Input type="url" placeholder="Instagram URL（任意）" value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} className="h-9 text-sm" />
              <Input type="url" placeholder="LINE URL（任意）" value={lineUrl} onChange={e => setLineUrl(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !canSubmit}
              className="w-full h-11 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {isPending ? '参加処理中...' : '参加を完了する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
