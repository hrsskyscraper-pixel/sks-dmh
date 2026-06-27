import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TeamManager } from '@/components/admin/team-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { maskEmails } from '@/lib/email-visibility'
import type { Employee, Role } from '@/types/database'

export default async function AdminTeamsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const supabase = await createClient()
  const db = createAdminClient()

  // view-as 中は表示ロールに合わせて権限を落とす
  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveRole: Role = currentEmployee.role
  let effectiveEmployee: Employee = currentEmployee

  if (viewAsId) {
    const { data: viewAsEmp } = await db
      .from('employees')
      .select('id, auth_user_id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, notifications_read_at, font_scale, intro_dismissed_at, is_test, created_at, updated_at')
      .eq('id', viewAsId)
      .single()
    if (viewAsEmp) {
      effectiveRole = viewAsEmp.role as Role
      effectiveEmployee = viewAsEmp as Employee
    }
  }

  const [
    { data: teams },
    { data: teamMembers },
    { data: teamManagers },
    { data: employees },
    { data: changeRequests },
    { data: projectTeamsData },
    { data: projectsData },
  ] = await Promise.all([
    db.from('teams').select('id, name, type, prefecture, brand_id, brand_ids, is_test, created_at, updated_at').order('name'),
    db.from('team_members').select('team_id, employee_id, sort_order').order('sort_order'),
    db.from('team_managers').select('team_id, employee_id, role, sort_order').order('sort_order'),
    db.from('employees').select('id, auth_user_id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, notifications_read_at, font_scale, intro_dismissed_at, is_test, created_at, updated_at').order('name'),
    db.from('team_change_requests')
      .select('id, status, request_type, team_id, payload, requested_by, reviewed_by, reviewed_at, review_comment, applicant_read_at, created_at')
      .order('created_at', { ascending: false }),
    db.from('project_teams').select('project_id, team_id'),
    db.from('skill_projects').select('id, name').eq('is_active', true),
  ])
  const { data: brands } = await db.from('brands').select('id, name, color').order('sort_order')

  // 各プロジェクトのフェーズ件数（セットアップ未完了判定用）
  const activeProjectIds = (projectsData ?? []).map(p => p.id)
  const { data: phaseRows } = activeProjectIds.length > 0
    ? await db.from('project_phases').select('project_id').in('project_id', activeProjectIds)
    : { data: [] }
  const phaseCountMap: Record<string, number> = {}
  for (const pr of phaseRows ?? []) {
    phaseCountMap[pr.project_id] = (phaseCountMap[pr.project_id] ?? 0) + 1
  }
  const activeProjectsWithStatus = (projectsData ?? []).map(p => ({
    id: p.id,
    name: p.name,
    phaseCount: phaseCountMap[p.id] ?? 0,
  }))

  // メールアドレスは本人とシステム管理者にのみ表示（個人情報保護）。
  // 閲覧不可の email は空文字にしてからクライアントへ渡す。
  const employeesForClient = maskEmails(employees ?? [], effectiveEmployee)

  // チーム→プロジェクト名マップ
  const projectNameMap = Object.fromEntries((projectsData ?? []).map(p => [p.id, p.name]))
  const teamProjectNames: Record<string, string[]> = {}
  for (const pt of projectTeamsData ?? []) {
    const name = projectNameMap[pt.project_id]
    if (name) {
      if (!teamProjectNames[pt.team_id]) teamProjectNames[pt.team_id] = []
      teamProjectNames[pt.team_id].push(name)
    }
  }

  return (
    <>
      <TopBar title="チーム一覧" />
      <TeamManager
        currentEmployee={currentEmployee}
        effectiveEmployee={effectiveEmployee}
        effectiveRole={effectiveRole}
        teams={teams ?? []}
        teamMembers={teamMembers ?? []}
        teamManagers={teamManagers ?? []}
        employees={employeesForClient}
        changeRequests={changeRequests ?? []}
        teamProjectNames={teamProjectNames}
        brands={brands ?? []}
        activeProjects={activeProjectsWithStatus}
      />
    </>
  )
}
