import { cookies } from 'next/headers'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { SELECTED_PROJECT_COOKIE } from '@/lib/selected-project'
import { buildMilestoneMap, calcPhasePct } from '@/lib/milestone'
import { sortCategories } from '@/lib/category-order'
import { cn } from '@/lib/utils'
import { FolderKanban } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MySkillChartsClient } from '@/components/dashboard/my-skill-charts-client'

const PHASE_COLORS = ['bg-orange-500', 'bg-amber-500', 'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500']

/**
 * 「スキルバランス」「フェーズ別達成率」チャート（ホームから My ページへ移設）。
 * 本人の選択中習得カリキュラム（Cookie → 先頭）を解決し、ホームと同じ計算で描画する。
 */
export async function MySkillCharts({ employeeId }: { employeeId: string }) {
  const db = createAdminClient()

  // 参加習得カリキュラムを解決（team_members / team_managers → project_teams → 有効な skill_projects）
  const [{ data: tRows }, { data: mRows }] = await Promise.all([
    db.from('team_members').select('team_id').eq('employee_id', employeeId),
    db.from('team_managers').select('team_id').eq('employee_id', employeeId),
  ])
  const teamIds = [...new Set([...(tRows ?? []).map(r => r.team_id), ...(mRows ?? []).map(r => r.team_id)])]
  if (teamIds.length === 0) return null
  const { data: ptRows } = await db.from('project_teams').select('project_id').in('team_id', teamIds)
  const projIds = [...new Set((ptRows ?? []).map(r => r.project_id))]
  if (projIds.length === 0) return null
  const { data: projects } = await db.from('skill_projects').select('id, name, is_active').in('id', projIds).eq('is_active', true)
  const employeeProjects = projects ?? []
  if (employeeProjects.length === 0) return null

  const cookieStore = await cookies()
  const cookieProjectId = cookieStore.get(SELECTED_PROJECT_COOKIE)?.value ?? null
  const selectedProject = employeeProjects.find(p => p.id === cookieProjectId) ?? employeeProjects[0]

  const [{ data: projectPhaseRows }, { data: projectSkillRows }, { data: allSkills }, { data: achievements }, whResult] = await Promise.all([
    db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at').eq('project_id', selectedProject.id).order('order_index'),
    db.from('project_skills').select('skill_id, project_phase_id').eq('project_id', selectedProject.id),
    db.from('skills').select('id, category'),
    db.from('achievements').select('skill_id, status').eq('employee_id', employeeId),
    db.rpc('get_employee_cumulative_hours', { p_employee_id: employeeId, p_as_of_date: new Date().toISOString().split('T')[0] }),
  ])

  const projectPhases = projectPhaseRows ?? []
  if (projectPhases.length === 0) return null // フェーズ未設定なら何も出さない

  const skillPhaseMap: Record<string, string | null> = {}
  for (const ps of projectSkillRows ?? []) skillPhaseMap[ps.skill_id] = ps.project_phase_id
  const projectSkillIds = new Set(Object.keys(skillPhaseMap))
  const skills = (allSkills ?? []).filter(s => projectSkillIds.has(s.id))
  const milestones = buildMilestoneMap(projectPhases)
  const cumulativeHours = (whResult as { data: number | null }).data ?? 0

  const certifiedIds = new Set((achievements ?? []).filter(a => a.status === 'certified').map(a => a.skill_id))
  const pendingIds = new Set((achievements ?? []).filter(a => a.status === 'pending').map(a => a.skill_id))

  // フェーズ別進捗
  const phaseStats = projectPhases.map((phase, index) => {
    const phaseSkills = skills.filter(s => skillPhaseMap[s.id] === phase.id)
    const certified = phaseSkills.filter(s => certifiedIds.has(s.id)).length
    const pending = phaseSkills.filter(s => pendingIds.has(s.id)).length
    const pct = phaseSkills.length > 0 ? Math.round((certified / phaseSkills.length) * 100) : 0
    const m = milestones[phase.name]
    const standardPct = m ? calcPhasePct(cumulativeHours, m) : 0
    return {
      phase: phase.name,
      phaseId: phase.id,
      label: phase.name,
      months: '',
      total: phaseSkills.length,
      certified,
      pending,
      pct,
      standardPct,
      diff: pct - standardPct,
      colorClass: PHASE_COLORS[index % PHASE_COLORS.length],
    }
  })

  // カテゴリ別進捗（レーダー）
  const categories = sortCategories([...new Set(skills.map(s => s.category))])
  const radarData = categories.map(category => {
    const catSkills = skills.filter(s => s.category === category)
    const certified = catSkills.filter(s => certifiedIds.has(s.id)).length
    return {
      category,
      value: catSkills.length > 0 ? Math.round((certified / catSkills.length) * 100) : 0,
      total: catSkills.length,
      certified,
    }
  })

  return (
    <div className="space-y-4">
      {/* どの習得カリキュラムの集計かを明示 */}
      <div className="flex items-center gap-1.5 px-0.5">
        <FolderKanban className="w-4 h-4 text-orange-500 flex-shrink-0" />
        <span className="text-[11px] text-gray-400 flex-shrink-0">習得カリキュラム</span>
        <span className="text-sm font-semibold text-gray-800 truncate">{selectedProject.name}</span>
      </div>
      <MySkillChartsClient
        radarData={radarData}
        phaseStats={phaseStats}
        cumulativeHours={cumulativeHours}
        standardHours={projectPhases[projectPhases.length - 1]?.end_hours ?? 0}
      />

      {/* フェーズ別サマリーカード */}
      <div className={cn('grid gap-3', phaseStats.length <= 3 ? `grid-cols-${phaseStats.length}` : 'grid-cols-3')}>
        {phaseStats.map(({ phase, phaseId, label, total, certified, pending, pct, standardPct, diff, colorClass }) => (
          <Link key={phaseId} href={`/skills?phase=${encodeURIComponent(phase)}`}>
            <Card className="text-center overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-3 pb-3 px-2">
                <Badge className={`${colorClass} text-white text-[10px] mb-0.5 border-0`}>{label}</Badge>
                <p className="text-2xl font-black text-gray-800">{pct}<span className="text-xs">%</span></p>
                {standardPct > 0 ? (
                  <>
                    <p className="text-[10px] text-gray-400">標準 {standardPct}%</p>
                    <p className={cn('text-[11px] font-bold mt-0.5', diff >= 5 ? 'text-green-600' : diff <= -5 ? 'text-red-500' : 'text-gray-500')}>
                      {diff > 0 ? `▲${diff}pt` : diff < 0 ? `▼${Math.abs(diff)}pt` : '±0'}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-gray-400">未開始</p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">{certified}/{total}</p>
                {pending > 0 && <p className="text-[10px] text-amber-500">申請中 {pending}</p>}
                {total - certified - pending > 0 && <p className="text-[11px] font-bold text-orange-500">未申請 {total - certified - pending}</p>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
