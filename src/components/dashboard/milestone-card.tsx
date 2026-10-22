'use client'

import Link from 'next/link'
import { Award, Flag, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { MilestoneProgress } from '@/lib/milestones'

/**
 * ホームの「次の級まで」カード。
 * - 級（grade）: 到達していないものを「あと○項目」が少ない順に最大3件
 * - 全体ゴール（goal）: 1件（カリキュラム全体の残り）
 * - 何も設定されていないカリキュラムでは表示しない
 */
export function MilestoneCard({ milestones, skillsHref = '/skills' }: { milestones: MilestoneProgress[]; skillsHref?: string }) {
  const grades = milestones
    .filter(m => m.kind === 'grade' && m.status !== 'certified')
    .sort((a, b) => a.remaining - b.remaining || a.total - b.total)
    .slice(0, 3)
  const goal = milestones.find(m => m.kind === 'goal')
  const certifiedGrades = milestones.filter(m => m.kind === 'grade' && m.status === 'certified').length
  if (grades.length === 0 && !goal) return null

  return (
    <Card className="border-orange-200">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-orange-500" />
            次の級まで
          </p>
          {certifiedGrades > 0 && (
            <span className="text-[10px] text-gray-400">到達済み {certifiedGrades}</span>
          )}
        </div>
        <div className="space-y-2">
          {grades.map(m => <MilestoneRow key={m.skillId} m={m} href={skillsHref} />)}
          {goal && goal.status !== 'certified' && <MilestoneRow m={goal} href={skillsHref} isGoal />}
          {goal && goal.status === 'certified' && (
            <p className="text-xs text-emerald-700 flex items-center gap-1"><Flag className="w-3.5 h-3.5" />{goal.name} に到達しました</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function MilestoneRow({ m, href, isGoal = false }: { m: MilestoneProgress; href: string; isGoal?: boolean }) {
  const pct = m.total === 0 ? 100 : Math.round((m.done / m.total) * 100)
  const right =
    m.status === 'pending' ? { text: '認定待ち', cls: 'text-amber-600' }
    : m.status === 'ready' ? { text: isGoal ? 'ゴール申請へ' : '級の申請へ', cls: 'text-orange-600' }
    : { text: `あと ${m.remaining} 項目`, cls: 'text-gray-800' }
  const next = m.remainingSkills[0]
  return (
    <Link href={href} className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-orange-50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-700 truncate flex items-center gap-1">
          {isGoal ? <Flag className="w-3 h-3 text-orange-500 flex-shrink-0" /> : null}
          {m.name}
          {m.cert && <span className="text-[9px] rounded bg-amber-100 text-amber-700 px-1 flex-shrink-0">資格</span>}
        </span>
        <span className={cn('text-xs font-bold tabular-nums whitespace-nowrap flex items-center gap-0.5', right.cls)}>
          {right.text}
          <ChevronRight className="w-3 h-3 text-gray-300" />
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={cn('h-full rounded-full', isGoal ? 'bg-orange-400' : 'bg-blue-500')} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[10px] text-gray-400 tabular-nums">{m.done} / {m.total}</span>
        {next && m.status === 'in_progress' && (
          <span className="text-[10px] text-gray-500 truncate ml-2">次: {next.name}</span>
        )}
      </div>
    </Link>
  )
}
