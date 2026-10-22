'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Coins } from 'lucide-react'
import { saveGradeWageUps } from '@/app/(dashboard)/admin/settings/actions'

interface Props {
  /** 社内資格のマスタにある名前（並び順どおり） */
  certNames: string[]
  map: Record<string, number>
  updatedBy: string | null
  updatedAt: string | null
}

/**
 * 級ごとの上がる金額（2026-10-22 原島さん確定 A-5）。級を取得したメイトさんご本人のお祝い画面に、
 * りのちゃんが「○円アップだよ♡」と出す。社員の方には金額を出さない。空欄・0 は「出さない」。
 */
export function GradeWageUps({ certNames, map, updatedBy, updatedAt }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(certNames.map(n => [n, map[n] ? String(map[n]) : ''])),
  )
  const [isPending, startTransition] = useTransition()

  const save = () => {
    const out: Record<string, number> = {}
    for (const n of certNames) {
      const raw = (values[n] ?? '').trim()
      // 空欄は 0（金額を出さない）として送る。送らないと、前の金額が残ってしまう
      if (!raw) { out[n] = 0; continue }
      const v = Number(raw)
      if (!Number.isFinite(v) || v < 0) { toast.error(`${n} の金額を数字で入力してください`); return }
      out[n] = v
    }
    startTransition(async () => {
      const { error } = await saveGradeWageUps(out)
      if (error) { toast.error(error); return }
      toast.success('級ごとの金額を保存しました')
    })
  }

  // サーバー（UTC）と画面で同じ文字列になるよう、日本時間で整形する
  const fmt = (iso: string) =>
    `${new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} JST`

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-100">
          <Coins className="w-5 h-5 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">級を取得したときの時給アップ</p>
          <p className="text-xs text-gray-500">上がる分だけの金額（基本給に足した額ではありません）</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        級を取得したメイトさんご本人のお祝い画面に、りのちゃんが「○円アップだよ♡」と出します。金額はご本人にだけ出し、
        社員の方には金額なしでお祝いだけを出します。空欄の級は金額を出しません。
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {certNames.map(n => (
          <label key={n} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="w-16 flex-shrink-0 truncate">{n}</span>
            <Input
              inputMode="numeric"
              value={values[n] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [n]: e.target.value.replace(/[^0-9]/g, '') }))}
              className="h-8 w-20 text-right"
              aria-label={`${n} の金額（円）`}
            />
            <span className="text-xs text-gray-500">円</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {updatedAt ? <p className="text-[10px] text-gray-400">最終変更: {fmt(updatedAt)}{updatedBy ? `（${updatedBy}）` : ''}</p> : <span />}
        <Button size="sm" onClick={save} disabled={isPending}>保存する</Button>
      </div>
    </div>
  )
}
