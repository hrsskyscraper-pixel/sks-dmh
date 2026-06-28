import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TimelineFeed } from '@/components/timeline/timeline-feed'
import { getTestEmployeeIds } from '@/lib/test-data'

export default async function TimelinePage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const db = createAdminClient()

  const [
    { data: certifiedAchievements },
    { data: comments },
    { data: reactions },
    { data: employees },
  ] = await Promise.all([
    db.from('achievements')
      .select('id, employee_id, skill_id, certified_at, certified_by, skills(name, category)')
      .eq('status', 'certified')
      .not('certified_at', 'is', null)
      .order('certified_at', { ascending: false })
      .limit(50),
    db.from('achievement_comments')
      .select('id, achievement_id, employee_id, content, created_at')
      .order('created_at'),
    db.from('achievement_reactions')
      .select('id, achievement_id, employee_id, emoji'),
    db.from('employees')
      .select('id, name, avatar_url')
      .order('name'),
  ])

  // テスト社員の投稿・反応・コメントは除外
  const testEmpIds = await getTestEmployeeIds()
  const visibleAchievements = (certifiedAchievements ?? []).filter(a => !testEmpIds.has(a.employee_id))
  const visibleComments = (comments ?? []).filter(c => !testEmpIds.has(c.employee_id))
  const visibleReactions = (reactions ?? []).filter(r => !testEmpIds.has(r.employee_id))

  const employeeMap = Object.fromEntries(
    (employees ?? []).filter(e => !testEmpIds.has(e.id)).map(e => [e.id, e])
  )

  // 所属（店舗・部署・PJチーム）と、習得したスキルが属する習得カリキュラムを取得
  const empIds = [...new Set(visibleAchievements.map(a => a.employee_id))]
  const skillIds = [...new Set(visibleAchievements.map(a => a.skill_id))]
  const [{ data: tmRows }, { data: tmgRows }, { data: psRows }] = await Promise.all([
    empIds.length ? db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', empIds) : Promise.resolve({ data: [] }),
    empIds.length ? db.from('team_managers').select('employee_id, teams(name, type)').in('employee_id', empIds) : Promise.resolve({ data: [] }),
    skillIds.length ? db.from('project_skills').select('skill_id, project_id').in('skill_id', skillIds) : Promise.resolve({ data: [] }),
  ])

  type Aff = { name: string; type: 'store' | 'department' | 'project' }
  const TYPE_ORDER: Record<Aff['type'], number> = { store: 0, department: 1, project: 2 }
  const affMap: Record<string, Map<string, Aff>> = {}
  const addAff = (rows: { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }[]) => {
    for (const r of rows) {
      const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
      if (!t || !['store', 'department', 'project'].includes(t.type)) continue
      ;(affMap[r.employee_id] ??= new Map()).set(t.name, { name: t.name, type: t.type as Aff['type'] })
    }
  }
  addAff((tmRows ?? []) as Parameters<typeof addAff>[0])
  addAff((tmgRows ?? []) as Parameters<typeof addAff>[0])
  const affByEmployee: Record<string, Aff[]> = {}
  for (const [id, m] of Object.entries(affMap)) {
    affByEmployee[id] = [...m.values()].sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.name.localeCompare(b.name, 'ja'))
  }

  const projIdsBySkill: Record<string, string[]> = {}
  const allProjIds = new Set<string>()
  for (const ps of (psRows ?? []) as { skill_id: string; project_id: string }[]) {
    ;(projIdsBySkill[ps.skill_id] ??= []).push(ps.project_id)
    allProjIds.add(ps.project_id)
  }
  const { data: projRows } = allProjIds.size > 0
    ? await db.from('skill_projects').select('id, name').in('id', [...allProjIds])
    : { data: [] as { id: string; name: string }[] }
  const projNameById: Record<string, string> = Object.fromEntries((projRows ?? []).map(p => [p.id, p.name]))
  const curriculaBySkill: Record<string, string[]> = {}
  for (const [sid, pids] of Object.entries(projIdsBySkill)) {
    curriculaBySkill[sid] = [...new Set(pids.map(p => projNameById[p]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
  }

  return (
    <>
      <TopBar title="タイムライン" />
      <TimelineFeed
        achievements={visibleAchievements}
        comments={visibleComments}
        reactions={visibleReactions}
        employeeMap={employeeMap}
        currentEmployeeId={currentEmployee.id}
        affByEmployee={affByEmployee}
        curriculaBySkill={curriculaBySkill}
      />
    </>
  )
}
