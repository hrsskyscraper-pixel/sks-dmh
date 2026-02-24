'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { RadarChart } from '@/components/charts/radar-chart'
import { PhaseProgressChart } from '@/components/charts/phase-progress-chart'
import type { Employee, Skill, Achievement } from '@/types/database'

interface Props {
  employee: Employee
  skills: Skill[]
  achievements: Achievement[]
  cumulativeHours: number
}

const PHASES = ['4月', '5月〜6月', '7月〜8月'] as const
const CATEGORIES = ['接客', '調理', '管理'] as const

const PHASE_COLORS: Record<string, string> = {
  '4月': 'bg-orange-500',
  '5月〜6月': 'bg-amber-500',
  '7月〜8月': 'bg-red-500',
}

export function DashboardContent({ employee, skills, achievements, cumulativeHours }: Props) {
  const certifiedIds = new Set(
    achievements.filter(a => a.status === 'certified').map(a => a.skill_id)
  )
  const pendingIds = new Set(
    achievements.filter(a => a.status === 'pending').map(a => a.skill_id)
  )

  // フェーズ別進捗
  const phaseStats = PHASES.map(phase => {
    const phaseSkills = skills.filter(s => s.phase === phase)
    const certified = phaseSkills.filter(s => certifiedIds.has(s.id)).length
    const pending = phaseSkills.filter(s => pendingIds.has(s.id)).length
    return {
      phase,
      total: phaseSkills.length,
      certified,
      pending,
      pct: phaseSkills.length > 0 ? Math.round((certified / phaseSkills.length) * 100) : 0,
    }
  })

  // カテゴリ別進捗（レーダーチャート用）
  const radarData = CATEGORIES.map(category => {
    const catSkills = skills.filter(s => s.category === category)
    const certified = catSkills.filter(s => certifiedIds.has(s.id)).length
    return {
      category,
      value: catSkills.length > 0 ? Math.round((certified / catSkills.length) * 100) : 0,
      total: catSkills.length,
      certified,
    }
  })

  const totalCertified = certifiedIds.size
  const totalSkills = skills.length
  const totalPct = totalSkills > 0 ? Math.round((totalCertified / totalSkills) * 100) : 0

  const firstName = employee.name.split(/\s/)[0]

  return (
    <div className="p-4 space-y-4">
      {/* ウェルカムカード */}
      <Card className="bg-gradient-to-br from-orange-400 to-red-500 text-white border-0 shadow-lg">
        <CardContent className="pt-5 pb-5">
          <p className="text-orange-100 text-sm mb-1">おつかれさまです</p>
          <h2 className="text-2xl font-bold mb-3">{firstName} さん</h2>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-orange-100 text-xs">全体達成率</p>
              <p className="text-4xl font-black">{totalPct}<span className="text-xl">%</span></p>
            </div>
            <div>
              <p className="text-orange-100 text-xs">認定済み</p>
              <p className="text-2xl font-bold">{totalCertified}<span className="text-base text-orange-100">/{totalSkills}</span></p>
            </div>
            <div>
              <p className="text-orange-100 text-xs">申請中</p>
              <p className="text-2xl font-bold">{pendingIds.size}</p>
            </div>
          </div>
          <div className="mt-3">
            <Progress
              value={totalPct}
              className="h-2 bg-orange-300"
            />
          </div>
        </CardContent>
      </Card>

      {/* レーダーチャート */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">スキルバランス</CardTitle>
        </CardHeader>
        <CardContent>
          <RadarChart data={radarData} />
        </CardContent>
      </Card>

      {/* フェーズ別進捗 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">フェーズ別達成率</CardTitle>
        </CardHeader>
        <CardContent>
          <PhaseProgressChart data={phaseStats} />
        </CardContent>
      </Card>

      {/* フェーズ別サマリーカード */}
      <div className="grid grid-cols-3 gap-3">
        {phaseStats.map(({ phase, total, certified, pending, pct }) => (
          <Card key={phase} className="text-center">
            <CardContent className="pt-3 pb-3 px-2">
              <Badge className={`${PHASE_COLORS[phase]} text-white text-[10px] mb-1 border-0`}>
                {phase}
              </Badge>
              <p className="text-2xl font-black text-gray-800">{pct}<span className="text-xs">%</span></p>
              <p className="text-[10px] text-gray-500">{certified}/{total}</p>
              {pending > 0 && (
                <p className="text-[10px] text-amber-500">申請中 {pending}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
