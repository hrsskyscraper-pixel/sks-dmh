'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Award, Sparkles, Trophy } from 'lucide-react'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { markAchievementsCelebrated } from '@/app/(dashboard)/actions'
import { acquireModal } from '@/lib/modal-queue'

export interface CelebrationItem {
  achievementId: string
  skillName: string
  /** 'grade'＝級 / 'goal'＝全体ゴール / null＝通常のスキル */
  milestoneKind: 'grade' | 'goal' | null
  milestoneCert: string | null
  /** 店長からの一言（公開） */
  praise: string | null
  certifierName: string | null
  certifierId: string | null
  certifierAvatar: string | null
}

interface Props {
  items: CelebrationItem[]
  /** この認定で「フェーズが全部そろった」フェーズ名 */
  completedPhases: string[]
  employeeName: string
  /** 本人の顔写真（お祝い画面の主役） */
  employeeId?: string
  employeeAvatar?: string | null
  /** 見本表示（管理者の確認用）。閉じても記録しない */
  preview?: boolean
}

const COLORS = ['#f97316', '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa']

/**
 * レベルアップ演出（2026-09-19 MTG 決定 ②「提案通りで一回作ってみる」）
 * 承認がおりたあと、本人が次にホームを開いたときに一度だけ出す。紙吹雪＋認定スキル名。
 * 級到達・フェーズ完了はバッジで強調する。閉じると celebrated_at を記録し、以後は出ない。
 */
export function LevelUpCelebration({ items, completedPhases, employeeName, employeeId, employeeAvatar, preview = false }: Props) {
  const [open, setOpen] = useState(false)
  const releaseRef = useRef<(() => void) | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (items.length === 0 || startedRef.current) return
    startedRef.current = true
    let cancelled = false
    acquireModal().then(release => {
      if (cancelled) { release(); return }
      releaseRef.current = release
      setOpen(true)
    })
    return () => { cancelled = true }
  }, [items.length])

  // 紙吹雪の配置は添字から決める（描画中に乱数を使わない。見た目は十分ばらける）
  const confetti = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: (i * 37 + 11) % 100,
    delay: ((i * 13) % 12) / 10,
    duration: 2.6 + ((i * 7) % 18) / 10,
    size: 6 + ((i * 5) % 6),
    color: COLORS[i % COLORS.length],
    rotate: (i * 47) % 360,
    round: i % 3 === 0,
  })), [])

  const close = () => {
    setOpen(false)
    releaseRef.current?.()
    releaseRef.current = null
    if (!preview) markAchievementsCelebrated(items.map(i => i.achievementId)).catch(() => { /* 次回また出るだけ */ })
  }

  const grades = items.filter(i => i.milestoneKind === 'grade')
  const goals = items.filter(i => i.milestoneKind === 'goal')
  const normals = items.filter(i => !i.milestoneKind)
  // まとめて認定したときは同じ一言が件数ぶん並ぶので、同じ文面（同じ書き手）は1つにまとめる
  const praises = items.filter(i => i.praise).filter((i, idx, arr) => arr.findIndex(x => x.praise === i.praise && x.certifierName === i.certifierName) === idx)
  const headline = goals.length > 0
    ? `${goals[0].skillName} 到達！`
    : grades.length > 0
      ? `${grades[0].milestoneCert ?? grades[0].skillName} 到達！`
      : items.length === 1 ? 'スキル認定！' : `${items.length}件のスキルが認定されました！`

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        {/* 紙吹雪 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="mb-confetti absolute -top-3 block"
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.round ? c.size : c.size * 1.6,
                background: c.color,
                borderRadius: c.round ? '50%' : 2,
                transform: `rotate(${c.rotate}deg)`,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes mb-confetti-fall {
            0% { transform: translateY(-10px) rotate(0deg); opacity: 1 }
            100% { transform: translateY(520px) rotate(720deg); opacity: 0 }
          }
          .mb-confetti { animation-name: mb-confetti-fall; animation-timing-function: ease-in; animation-fill-mode: forwards }
          @media (prefers-reduced-motion: reduce) { .mb-confetti { display: none } }
        `}</style>

        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              {headline}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative space-y-3 text-center">
          {preview && <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded px-2 py-1 inline-block">見本（実際の認定ではありません）</p>}
          <div className="flex flex-col items-center gap-1.5">
            <CertRingAvatar employeeId={employeeId} src={employeeAvatar ?? undefined} name={employeeName} size={72} fallbackClassName="bg-orange-100 text-orange-700 text-xl" />
            <p className="text-sm text-gray-600">{employeeName} さん、おめでとうございます！</p>
          </div>

          {(grades.length > 0 || goals.length > 0) && (
            <div className="flex flex-wrap justify-center gap-2">
              {[...goals, ...grades].map(i => (
                <span key={i.achievementId} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-sm font-bold">
                  <Trophy className="w-4 h-4" />{i.skillName}
                  {i.milestoneCert && <span className="text-[11px] font-normal text-amber-700">→ 社内資格「{i.milestoneCert}」に登録</span>}
                </span>
              ))}
            </div>
          )}

          {normals.length > 0 && (
            <ul className="mx-auto max-w-xs space-y-1 text-left">
              {normals.slice(0, 8).map(i => (
                <li key={i.achievementId} className="flex items-center gap-2 text-sm text-gray-800">
                  <Award className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="truncate">{i.skillName}</span>
                </li>
              ))}
              {normals.length > 8 && <li className="text-xs text-gray-400 pl-6">ほか {normals.length - 8} 件</li>}
            </ul>
          )}

          {completedPhases.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {completedPhases.map(p => (
                <span key={p} className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-xs font-bold">
                  🎯 {p} 完了！
                </span>
              ))}
            </div>
          )}

          {praises.length > 0 && (
            <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5 text-left space-y-2">
              {praises.slice(0, 3).map(i => (
                <div key={i.achievementId} className="flex items-start gap-2">
                  <CertRingAvatar employeeId={i.certifierId} src={i.certifierAvatar ?? undefined} name={i.certifierName ?? '?'} size={32} className="flex-shrink-0 mt-0.5" fallbackClassName="bg-sky-100 text-sky-700" />
                  <div className="min-w-0">
                    {i.certifierName && <p className="text-[11px] font-semibold text-sky-700">{i.certifierName} さんから</p>}
                    <p className="text-sm text-sky-900 leading-relaxed">「{i.praise}」</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button onClick={close} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
            次のミッションへ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
