export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { TestUserGuide } from '@/components/testuser/test-user-guide'
import { TeamRankingServer } from '@/components/dashboard/team-ranking-server'
import { CheckpointRecords } from '@/components/dashboard/checkpoint-records'
import { TimelineServer } from '@/components/timeline/timeline-server'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap } from '@/lib/milestone'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LineLinkBanner } from '@/components/layout/line-link-banner'
import { LineLinkToast } from '@/components/layout/line-link-toast'

function TeamRankingSkeleton() {
  return (
    <Card className="mx-4">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl px-3 py-3 bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-4 bg-gray-200 rounded animate-pulse" />
              <div className="w-7 h-7 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-2 bg-gray-200 rounded-full animate-pulse" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ project_id?: string; line_linked?: string; line_error?: string }>
}) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const supabase = await createClient()

  const cookieStore = await cookies()
  const canViewAs = true // 全ロールでView-as可能（閲覧のみ）
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  // testuser で view-as 未設定 → ガイド画面を表示
  if (currentEmployee.role === 'testuser' && !viewAsId) {
    const adminDb = createAdminClient()
    const { data: testEmployees } = await adminDb
      .from('employees')
      .select('id, name, role, employment_type')
      .neq('role', 'testuser')
      .order('name')
    return (
      <>
        <TopBar title="Growth Driver" />
        <TestUserGuide employees={testEmployees ?? []} />
      </>
    )
  }

  // testuser はRLSを回避するため admin client でデータ取得
  const db = createAdminClient()

  // targetEmployee と searchParams を並列取得
  const [targetEmployeeResult, params] = await Promise.all([
    viewAsId
      ? db.from('employees').select('id, name, name_kana, email, role, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, line_user_id, status, requested_team_id, requested_project_team_id, notifications_read_at, auth_user_id, created_at, updated_at').eq('id', viewAsId).single()
      : Promise.resolve({ data: null }),
    searchParams ?? Promise.resolve(undefined),
  ])
  const employee = (targetEmployeeResult as { data: typeof currentEmployee | null }).data ?? currentEmployee

  // 参加プロジェクト一覧（project_teams + team_members 経由）
  const { data: myTeamRows } = await db.from('team_members').select('team_id').eq('employee_id', employee.id)
  const { data: myManagerRows } = await db.from('team_managers').select('team_id').eq('employee_id', employee.id)
  const myTeamIds = [...new Set([...(myTeamRows ?? []).map(r => r.team_id), ...(myManagerRows ?? []).map(r => r.team_id)])]
  const { data: myProjectTeamRows } = myTeamIds.length > 0
    ? await db.from('project_teams').select('project_id').in('team_id', myTeamIds)
    : { data: [] }
  const myProjectIds = [...new Set((myProjectTeamRows ?? []).map(r => r.project_id))]
  const { data: myProjects } = myProjectIds.length > 0
    ? await db.from('skill_projects').select('id, name, is_active').in('id', myProjectIds).eq('is_active', true)
    : { data: [] }
  const employeeProjects = myProjects ?? []

  const requestedProjectId = (params as { project_id?: string } | undefined)?.project_id
  const selectedProject = employeeProjects.find(p => p.id === requestedProjectId)
    ?? employeeProjects[0]
    ?? null

  const effectiveRole = employee.role

  // pending件数（manager は内部で直列クエリが必要なため async IIFE で並列起動）
  const pendingCountsTask = (async (): Promise<{ pendingAchievementsCount: number; pendingTeamRequestsCount: number }> => {
    if (!['store_manager', 'manager', 'admin', 'ops_manager', 'executive'].includes(effectiveRole)) {
      return { pendingAchievementsCount: 0, pendingTeamRequestsCount: 0 }
    }
    const achievementsCountP = (effectiveRole === 'store_manager' || effectiveRole === 'manager')
      ? (async () => {
          const { data: leaderTeamRows } = await db
            .from('team_managers').select('team_id').eq('employee_id', employee.id)
          const myTeamIds = (leaderTeamRows ?? []).map(r => r.team_id)
          if (!myTeamIds.length) return 0
          const { data: myMembers } = await db
            .from('team_members').select('employee_id').in('team_id', myTeamIds)
          const myMemberIds = (myMembers ?? []).map(r => r.employee_id)
          if (!myMemberIds.length) return 0
          const { count } = await db
            .from('achievements').select('*', { count: 'exact', head: true })
            .eq('status', 'pending').in('employee_id', myMemberIds)
          return count ?? 0
        })()
      : db.from('achievements').select('*', { count: 'exact', head: true })
          .eq('status', 'pending').then(r => r.count ?? 0)

    const teamRequestsCountP = ['admin', 'ops_manager', 'executive'].includes(effectiveRole)
      ? db.from('team_change_requests').select('*', { count: 'exact', head: true })
          .eq('status', 'pending').then(r => r.count ?? 0)
      : Promise.resolve(0)

    const [pendingAchievementsCount, pendingTeamRequestsCount] = await Promise.all([
      achievementsCountP,
      teamRequestsCountP,
    ])
    return { pendingAchievementsCount, pendingTeamRequestsCount }
  })()

  // 個人データのみ並列取得（teamStats関連は Suspense で分離）
  const [
    projectPhasesResult,
    projectSkillsResult,
    { data: allSkills },
    { data: achievements },
    workHoursSumResult,
    { data: goalRows },
    { data: careerRows },
    { data: allEmployeesForCareer },
    { data: teamMemberRows },
    { pendingAchievementsCount, pendingTeamRequestsCount },
  ] = await Promise.all([
    selectedProject
      ? db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at').eq('project_id', selectedProject.id).order('order_index')
      : Promise.resolve({ data: [] }),
    selectedProject
      ? db.from('project_skills').select('skill_id, project_phase_id').eq('project_id', selectedProject.id)
      : Promise.resolve({ data: [] }),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, standard_hours, is_checkpoint, created_at').order('order_index'),
    db.from('achievements').select('id, skill_id, employee_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement, notes, apply_comment, certify_comment, is_read, created_at, skills(id, name, phase, category, order_index, target_date_hint, standard_hours, is_checkpoint, created_at), certified_employee:employees!achievements_certified_by_fkey(name, avatar_url)').eq('employee_id', employee.id),
    db.rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    }),
    db.from('goals').select('id, content, set_at, deadline').eq('employee_id', employee.id).order('created_at', { ascending: false }).limit(1),
    db.from('career_records').select('record_type, department, reason, related_employee_ids, occurred_at').eq('employee_id', employee.id).order('occurred_at', { ascending: false }),
    db.from('employees').select('id, name').order('name'),
    db.from('team_members').select('team_id, teams(name, type)').eq('employee_id', employee.id),
    pendingCountsTask,
  ])

  const projectPhaseRows = (projectPhasesResult as { data: { id: string; project_id: string; name: string; order_index: number; end_hours: number; created_at: string }[] }).data ?? []
  const projectSkillRows = (projectSkillsResult as { data: { skill_id: string; project_phase_id: string | null }[] }).data ?? []
  const workHoursSum = (workHoursSumResult as { data: number | null }).data ?? 0

  // unreadNotifications は achievements から生成（別クエリ不要）
  const unreadNotifications = viewAsId
    ? []
    : (achievements ?? []).filter(a => !a.is_read && ['certified', 'rejected'].includes(a.status))

  // skillPhaseMap
  const skillPhaseMap: Record<string, string | null> = {}
  for (const ps of projectSkillRows ?? []) {
    skillPhaseMap[ps.skill_id] = ps.project_phase_id
  }

  const projectSkillIds = new Set(Object.keys(skillPhaseMap))
  const skills = (allSkills ?? []).filter(s => projectSkillIds.has(s.id))

  const projectPhases = projectPhaseRows ?? []
  const milestones = buildMilestoneMap(projectPhases)

  const lastPhase = projectPhases[projectPhases.length - 1]
  const standardEndHours = lastPhase?.end_hours ?? 0

  return (
    <>
      <Suspense><LineLinkToast /></Suspense>
      <TopBar
        title="Growth Driver"
        right={
          <div className="flex items-end gap-2 sm:gap-3">
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">標準<br className="sm:hidden" />完了</p>
              <p className="text-sm sm:text-base font-bold text-gray-400">{standardEndHours}h</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">8h<br className="sm:hidden" />換算</p>
              <p className="text-sm sm:text-base font-bold text-gray-400">{Math.floor(standardEndHours / 8)}日</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">累計<br className="sm:hidden" />勤務</p>
              <p className="text-sm sm:text-base font-bold text-orange-500">{workHoursSum}h</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">8h<br className="sm:hidden" />換算</p>
              <p className="text-sm sm:text-base font-bold text-gray-600">{Math.floor(workHoursSum / 8)}日</p>
            </div>
          </div>
        }
      />
      {!currentEmployee.line_user_id && <LineLinkBanner />}
      <DashboardContent
        employee={employee}
        skills={skills}
        achievements={achievements ?? []}
        cumulativeHours={workHoursSum}
        milestones={milestones}
        projectPhases={projectPhases}
        skillPhaseMap={skillPhaseMap}
        currentProject={selectedProject}
        employeeProjects={employeeProjects as { id: string; name: string; is_active: boolean }[]}
        unreadNotifications={unreadNotifications}
        pendingAchievementsCount={pendingAchievementsCount}
        pendingTeamRequestsCount={pendingTeamRequestsCount}
        currentGoal={(() => {
          // キャリア記録の「目標」から目標期日が最も近い（今日以降の）ものを取得
          const goalRecords = (careerRows ?? [])
            .filter(r => r.record_type === '目標' && r.department && r.occurred_at)
            .sort((a, b) => (a.occurred_at ?? '').localeCompare(b.occurred_at ?? ''))
          const today = new Date().toISOString().split('T')[0]
          const upcoming = goalRecords.find(r => r.occurred_at! >= today) ?? goalRecords[goalRecords.length - 1]
          if (upcoming) return { id: '', content: upcoming.department!, set_at: '', deadline: upcoming.occurred_at, reason: upcoming.reason ?? undefined }
          // フォールバック: 旧 goals テーブル
          return (goalRows ?? [])[0] ?? null
        })()}
        isOwnDashboard={!viewAsId}
        careerSummary={(() => {
          const empMap = Object.fromEntries((allEmployeesForCareer ?? []).map(e => [e.id, e.name]))
          const summary: Record<string, string[]> = {}
          for (const r of careerRows ?? []) {
            const names = (r.related_employee_ids ?? []).map((id: string) => empMap[id] ?? '不明')
            if (names.length > 0) summary[r.record_type] = names
          }
          return summary
        })()}
        storeName={(() => {
          const storeTeam = (teamMemberRows ?? []).find((m: { teams: { type: string } | null }) => m.teams?.type === 'store')
          return (storeTeam as { teams: { name: string } } | undefined)?.teams?.name ?? null
        })()}
        position={(careerRows ?? []).find(r => r.record_type === '役職' && r.department)?.department ?? null}
        internalCerts={[...new Set((careerRows ?? []).filter(r => r.record_type === '資格' && r.department?.startsWith('[社内]')).map(r => r.department!.replace('[社内]', '')))]}
        employeeId={employee.id}
        hasGoalRecords={(careerRows ?? []).some(r => r.record_type === '目標')}
      />
      <Suspense fallback={<TeamRankingSkeleton />}>
        <TeamRankingServer
          employeeId={employee.id}
          employeeRole={currentEmployee.role}
          selectedProjectId={selectedProject?.id ?? null}
        />
      </Suspense>
      <div className="mt-4">
        <Suspense fallback={null}>
          <CheckpointRecords
            employeeId={employee.id}
            employeeRole={currentEmployee.role}
            projectSkillIds={[...projectSkillIds]}
          />
        </Suspense>
      </div>
      <div className="mt-4">
        <Suspense fallback={<div className="px-4 py-8 text-center text-sm text-muted-foreground animate-pulse">タイムラインを読み込み中...</div>}>
          <TimelineServer
            employeeId={employee.id}
            employeeRole={currentEmployee.role}
          />
        </Suspense>
      </div>
    </>
  )
}
