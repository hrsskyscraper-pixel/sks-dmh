'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { SELECTED_PROJECT_COOKIE } from '@/lib/selected-project'
import { FONT_SCALE_COOKIE, isValidFontScale } from '@/lib/font-scale'
import { writeAuditLog } from '@/lib/audit'
import { canAdminister, canApprove } from '@/lib/permissions'
import { getAuthUser, getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { EMPTY_NAV_COUNTS, type NavCounts } from '@/lib/nav-counts'
import { getTestEmployeeIds } from '@/lib/test-data'
import type { Role, SystemPermission } from '@/types/database'

/**
 * ボトムナビ／通知ベルのバッジ系カウントをまとめて取得する。
 * 以前は (dashboard)/layout.tsx が毎レンダリングで直列に実行していたため、
 * すべてのページ遷移が 16〜23 クエリ＋RPC の完了を待ってブロックされていた。
 * これをレイアウトから剥がし、クライアントが描画後に呼ぶことで shell が即表示される。
 * 内部は 4 つの独立ブロックを並列実行する。
 */
export async function getNavCounts(): Promise<NavCounts> {
  const user = await getAuthUser()
  if (!user) return EMPTY_NAV_COUNTS
  const employee = await getCurrentEmployee()
  if (!employee) return EMPTY_NAV_COUNTS

  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  const db = createAdminClient()

  const { data: viewAsEmployee } = viewAsId
    ? await db.from('employees').select('role, system_permission, notifications_read_at').eq('id', viewAsId).single()
    : { data: null }

  const targetId = viewAsId ?? employee.id
  const notifReadAt = (viewAsId ? viewAsEmployee?.notifications_read_at : employee.notifications_read_at) ?? '1970-01-01T00:00:00Z'
  const effectiveEmp = {
    role: (viewAsEmployee?.role as Role | undefined) ?? (employee.role as Role),
    system_permission: (viewAsEmployee?.system_permission as SystemPermission | null | undefined) ?? employee.system_permission,
  }

  // --- ブロック1: 通知ベル＋チーム変更申請結果の未読 ---
  const computeNotif = async (): Promise<{ notifCount: number; unreadTeamReqCount: number }> => {
    const { data: targetAchievements } = await db.from('achievements').select('id').eq('employee_id', targetId)
    const targetAchIds = (targetAchievements ?? []).map(a => a.id)
    const [{ data: unreadReactions }, { data: unreadComments }, { data: unreadCertResults }, { count: unreadTeamReqCount }] = await Promise.all([
      targetAchIds.length > 0
        ? db.from('achievement_reactions').select('achievement_id, employee_id').in('achievement_id', targetAchIds).neq('employee_id', targetId).gt('created_at', notifReadAt)
        : Promise.resolve({ data: [] }),
      targetAchIds.length > 0
        ? db.from('achievement_comments').select('achievement_id, employee_id').in('achievement_id', targetAchIds).neq('employee_id', targetId).gt('created_at', notifReadAt)
        : Promise.resolve({ data: [] }),
      targetAchIds.length > 0
        ? db.from('achievement_history').select('achievement_id').in('achievement_id', targetAchIds).in('action', ['certify', 'reject']).gt('created_at', notifReadAt)
        : Promise.resolve({ data: [] }),
      db.from('team_change_requests').select('*', { count: 'exact', head: true })
        .eq('requested_by', targetId).in('status', ['approved', 'rejected']).gt('reviewed_at', notifReadAt),
    ])
    const notifKeys = new Set<string>()
    for (const r of unreadReactions ?? []) notifKeys.add(`${r.employee_id}:${r.achievement_id}`)
    for (const c of unreadComments ?? []) notifKeys.add(`${c.employee_id}:${c.achievement_id}`)
    const certResultKeys = new Set<string>()
    for (const h of unreadCertResults ?? []) certResultKeys.add(h.achievement_id)
    const utr = unreadTeamReqCount ?? 0
    return { notifCount: notifKeys.size + certResultKeys.size + utr, unreadTeamReqCount: utr }
  }

  // --- ブロック2: 差し戻しスキル件数 ---
  const computeRejected = async (): Promise<number> => {
    const { count } = await db.from('achievements').select('*', { count: 'exact', head: true })
      .eq('employee_id', targetId).eq('status', 'rejected')
    return count ?? 0
  }

  // --- ブロック3: 承認待ち合計（リーダー以上のみ、テスト社員は除外） ---
  const computePendingApproval = async (): Promise<number> => {
    if (!canApprove(effectiveEmp)) return 0
    const testIds = await getTestEmployeeIds()
    if (canAdminister(effectiveEmp)) {
      const [{ data: pendAch }, { data: pendReq }, { data: pendJoin }] = await Promise.all([
        db.from('achievements').select('employee_id').eq('status', 'pending'),
        db.from('team_change_requests').select('requested_by').eq('status', 'pending'),
        db.from('employees').select('id').eq('status', 'pending').not('requested_team_id', 'is', null),
      ])
      const a = (pendAch ?? []).filter(r => !testIds.has(r.employee_id)).length
      const t = (pendReq ?? []).filter(r => !r.requested_by || !testIds.has(r.requested_by)).length
      const j = (pendJoin ?? []).filter(r => !testIds.has(r.id)).length
      return a + t + j
    }
    // store_manager / manager: 管理チームのメンバーのみ
    const { data: managed } = await db.from('team_managers').select('team_id').eq('employee_id', targetId)
    const managedTeamIds = (managed ?? []).map(m => m.team_id)
    if (managedTeamIds.length === 0) return 0
    const { data: members } = await db.from('team_members').select('employee_id').in('team_id', managedTeamIds)
    const managedMemberIds = [...new Set((members ?? []).map(m => m.employee_id))].filter(id => !testIds.has(id))
    if (managedMemberIds.length === 0) return 0
    const [{ data: pendAch }, { data: pendReq }, { data: pendJoin }] = await Promise.all([
      db.from('achievements').select('employee_id').eq('status', 'pending').in('employee_id', managedMemberIds),
      db.from('team_change_requests').select('requested_by').eq('status', 'pending').in('team_id', managedTeamIds),
      db.from('employees').select('id').eq('status', 'pending').not('requested_team_id', 'is', null).in('requested_team_id', managedTeamIds),
    ])
    const a = (pendAch ?? []).length
    const t = (pendReq ?? []).filter(r => !r.requested_by || !testIds.has(r.requested_by)).length
    const j = (pendJoin ?? []).filter(r => !testIds.has(r.id)).length
    return a + t + j
  }

  // --- ブロック4: ホームのバッジ（遅れ/次の一歩） ---
  const computeDashboardBadge = async (): Promise<NavCounts['dashboardBadge']> => {
    const [{ data: tRows }, { data: mRows }] = await Promise.all([
      db.from('team_members').select('team_id').eq('employee_id', targetId),
      db.from('team_managers').select('team_id').eq('employee_id', targetId),
    ])
    const tIds = [...new Set([...(tRows ?? []).map(r => r.team_id), ...(mRows ?? []).map(r => r.team_id)])]
    if (tIds.length === 0) return null
    const { data: ptRows } = await db.from('project_teams').select('project_id').in('team_id', tIds)
    const projIds = [...new Set((ptRows ?? []).map(r => r.project_id))]
    if (projIds.length === 0) return null
    const firstProjId = projIds[0]
    const [{ data: phases }, { data: pSkills }, { data: certAch }, whResult] = await Promise.all([
      db.from('project_phases').select('id, name, order_index, end_hours').eq('project_id', firstProjId).order('order_index'),
      db.from('project_skills').select('skill_id, project_phase_id').eq('project_id', firstProjId),
      db.from('achievements').select('skill_id').eq('employee_id', targetId).eq('status', 'certified'),
      db.rpc('get_employee_cumulative_hours', { p_employee_id: targetId, p_as_of_date: new Date().toISOString().split('T')[0] }),
    ])
    const cumHours = (whResult as { data: number | null }).data ?? 0
    const certifiedSkillIds = new Set((certAch ?? []).map(a => a.skill_id))
    const phaseById = Object.fromEntries((phases ?? []).map(p => [p.id, p]))
    const sortedPhases = [...(phases ?? [])].sort((a, b) => a.order_index - b.order_index)
    const currentPhaseIdx = sortedPhases.findIndex(p => cumHours < p.end_hours)
    let delayedCount = 0
    let nextCount = 0
    for (const ps of pSkills ?? []) {
      if (certifiedSkillIds.has(ps.skill_id)) continue
      const phase = phaseById[ps.project_phase_id ?? '']
      if (!phase) continue
      const phaseIdx = sortedPhases.findIndex(p => p.id === phase.id)
      if (cumHours >= phase.end_hours) delayedCount++
      else if (phaseIdx <= currentPhaseIdx) nextCount++
    }
    if (delayedCount > 0) return { count: delayedCount, color: 'red' }
    if (nextCount > 0) return { count: nextCount, color: 'blue' }
    return null
  }

  const [notif, rejectedSkillCount, pendingApprovalCount, dashboardBadge] = await Promise.all([
    computeNotif(),
    computeRejected(),
    computePendingApproval(),
    computeDashboardBadge(),
  ])

  return {
    notifCount: notif.notifCount,
    unreadTeamReqCount: notif.unreadTeamReqCount,
    pendingApprovalCount,
    rejectedSkillCount,
    dashboardBadge,
  }
}

export async function setViewAs(employeeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, employeeId, { path: '/' })
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function setSelectedProject(projectId: string) {
  const cookieStore = await cookies()
  cookieStore.set(SELECTED_PROJECT_COOKIE, projectId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}

/**
 * ログイン中ユーザー自身の文字サイズ設定を更新する。
 * DB（employees.font_scale）を正とし、Cookie はSSR時のチラつき防止のミラーとして同期する。
 * view-as 中でも「自分の」表示設定なので、必ず auth_user_id ベースで自分の行を更新する。
 */
export async function setFontScale(scale: number): Promise<{ error?: string }> {
  if (!isValidFontScale(scale)) return { error: '不正な値です' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('employees').update({ font_scale: scale }).eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  const cookieStore = await cookies()
  cookieStore.set(FONT_SCALE_COOKIE, String(scale), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
  return {}
}

export async function clearViewAs() {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  revalidatePath('/', 'layout')
  redirect('/')
}

/** 社員のテスト用フラグを切り替える（管理者のみ）。公開表示からの除外に反映される。 */
export async function setEmployeeTest(employeeId: string, isTest: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }
  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('employees').update({ is_test: isTest }).eq('id', employeeId)
  if (error) return { error: error.message }
  revalidatePath('/admin/employees')
  revalidatePath('/', 'layout')
  return {}
}

/** チーム/店舗のテスト用フラグを切り替える（管理者のみ）。所属メンバーもカスケードで公開表示から除外される。 */
export async function setTeamTest(teamId: string, isTest: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }
  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('teams').update({ is_test: isTest }).eq('id', teamId)
  if (error) return { error: error.message }
  revalidatePath('/admin/teams')
  revalidatePath('/admin/brands')
  revalidatePath('/', 'layout')
  return {}
}

export async function updateEmployeeName(employeeId: string, newName: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('employees').update({ name: newName.trim() }).eq('id', employeeId)
  if (error) return { error: error.message }
  revalidatePath('/admin/employees')
  revalidatePath(`/admin/employees/${employeeId}`)
  return {}
}

export async function updateSkillCategory(skillId: string, newCategory: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase
    .from('employees')
    .select('role, system_permission')
    .eq('auth_user_id', user.id)
    .single()

  if (!emp || !canAdminister(emp)) {
    return { error: '権限がありません' }
  }

  const adminDb = createAdminClient()
  const { error } = await adminDb
    .from('skills')
    .update({ category: newCategory })
    .eq('id', skillId)

  if (error) return { error: error.message }
  return {}
}

export async function markNotificationsRead(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  // view-as中は対象社員のnotifications_read_atを更新
  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null

  const adminDb = createAdminClient()
  const { error } = viewAsId
    ? await adminDb.from('employees').update({ notifications_read_at: new Date().toISOString() }).eq('id', viewAsId)
    : await adminDb.from('employees').update({ notifications_read_at: new Date().toISOString() }).eq('auth_user_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function addCareerRecord(data: {
  employee_id: string
  record_type: string
  occurred_at: string | null
  related_employee_ids: string[]
  department: string | null
  reason: string | null
  notes: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase.from('employees').select('id, role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp) return { error: '権限がありません' }
  // 自分自身の「目標」記録は本人（メンバーを含む）も作成できる。
  // それ以外（他人の記録・目標以外の種別）はリーダー以上（canApprove）が必要。
  const isOwnGoal = data.record_type === '目標' && data.employee_id === emp.id
  if (!isOwnGoal && !canApprove(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('career_records').insert({
    ...data,
    created_by: emp.id,
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/employees/${data.employee_id}`)
  return {}
}

export async function updateCareerRecord(recordId: string, employeeId: string, data: {
  record_type: string
  occurred_at: string | null
  related_employee_ids: string[]
  department: string | null
  reason: string | null
  notes: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('career_records').update(data).eq('id', recordId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/employees/${employeeId}`)
  return {}
}

export async function deleteCareerRecord(recordId: string, employeeId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('career_records').delete().eq('id', recordId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/employees/${employeeId}`)
  return {}
}

export async function updateSkillStandardHours(skillId: string, hours: number | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase
    .from('employees')
    .select('role, system_permission')
    .eq('auth_user_id', user.id)
    .single()

  if (!emp || !canAdminister(emp)) {
    return { error: '権限がありません' }
  }

  const adminDb = createAdminClient()
  const { error } = await adminDb
    .from('skills')
    .update({ standard_hours: hours })
    .eq('id', skillId)

  if (error) return { error: error.message }
  return {}
}

export async function updateSkillTargetDate(skillId: string, date: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('skills').update({ target_date_hint: date }).eq('id', skillId)
  if (error) return { error: error.message }
  return {}
}

export async function updateSkillName(skillId: string, newName: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('skills').update({ name: newName.trim() }).eq('id', skillId)
  if (error) return { error: error.message }
  return {}
}

export async function createSkill(data: { name: string; category: string }): Promise<{ data?: { id: string }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { data: maxOrder } = await adminDb.from('skills').select('order_index').order('order_index', { ascending: false }).limit(1).single()
  const nextOrder = (maxOrder?.order_index ?? 0) + 1

  const { data: created, error } = await adminDb.from('skills')
    .insert({ name: data.name.trim(), category: data.category, order_index: nextOrder })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { data: created }
}

export async function reorderSkills(skillIds: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const adminDb = createAdminClient()
  const updates = skillIds.map((id, index) =>
    adminDb.from('skills').update({ order_index: index + 1 }).eq('id', id)
  )
  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }
  return {}
}

export async function deleteSkill(skillId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('skills').delete().eq('id', skillId)
  if (error) return { error: error.message }
  return {}
}

export async function toggleSkillCheckpoint(skillId: string, isCheckpoint: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) return { error: '権限がありません' }

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('skills').update({ is_checkpoint: isCheckpoint }).eq('id', skillId)
  if (error) return { error: error.message }
  return {}
}

export async function changeEmployeeRole(employeeId: string, newRole: string, newEmploymentType: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: actor } = await supabase.from('employees').select('id, role, system_permission').eq('auth_user_id', user.id).single()
  if (!actor) return { error: '権限がありません' }

  // 旧ロール取得
  const adminDb = createAdminClient()
  const { data: target } = await adminDb.from('employees').select('role, employment_type, name').eq('id', employeeId).single()
  if (!target) return { error: '対象社員が見つかりません' }

  const { error } = await adminDb.from('employees').update({
    role: newRole as 'employee' | 'store_manager' | 'manager' | 'admin' | 'ops_manager' | 'executive',
    employment_type: newEmploymentType as '社員' | 'メイト',
  }).eq('id', employeeId)
  if (error) return { error: error.message }

  // 監査ログ
  await writeAuditLog({
    action: 'change_role',
    actorId: actor.id,
    targetId: employeeId,
    details: {
      old_role: target.role,
      old_employment_type: target.employment_type,
      new_role: newRole,
      new_employment_type: newEmploymentType,
      target_name: target.name,
    },
  })

  return {}
}
