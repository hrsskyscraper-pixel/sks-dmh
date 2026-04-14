import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendApprovalNotification } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit'
import { canAdminister, canApprove } from '@/lib/permissions'

// mate ロールは DB 上は employee + employment_type='メイト' として保存
function resolveRole(role: string): { dbRole: string; employmentType: '社員' | 'メイト' } {
  if (role === 'mate') return { dbRole: 'employee', employmentType: 'メイト' }
  return { dbRole: role, employmentType: '社員' }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const db = createAdminClient()

  // 承認者の権限チェック
  const { data: approver } = await db
    .from('employees')
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!approver || !canApprove(approver)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { employeeId, lastName, firstName, teamId, projectTeamId, role, approvedBy } = await request.json()
  if (!employeeId || !role) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const effectiveTeamId = teamId === '__none__' ? null : (teamId || null)
  const effectiveProjectTeamId = projectTeamId === '__none__' ? null : (projectTeamId || null)

  // store_manager / manager は自分の管理チームのみ承認可能
  const isSystemAdmin = canAdminister(approver)
  if (!isSystemAdmin) {
    if (effectiveTeamId) {
      const { data: managed } = await db
        .from('team_managers')
        .select('team_id')
        .eq('employee_id', approver.id)
      const managedIds = (managed ?? []).map(m => m.team_id)
      if (!managedIds.includes(effectiveTeamId)) {
        return NextResponse.json({ error: 'この店舗の承認権限がありません' }, { status: 403 })
      }
    }
    // 店長・マネジャーは mate / employee のみ
    if (!['mate', 'employee'].includes(role)) {
      return NextResponse.json({ error: 'ロール変更の権限がありません' }, { status: 403 })
    }
  }

  // 対象社員の確認
  const { data: target } = await db
    .from('employees')
    .select('id, name, email, status')
    .eq('id', employeeId)
    .eq('status', 'pending')
    .single()
  if (!target) {
    return NextResponse.json({ error: '対象の社員が見つかりません' }, { status: 404 })
  }

  const { dbRole, employmentType } = resolveRole(role)

  // 1. employee を approved に更新
  const { error: updateErr } = await db.from('employees').update({
    status: 'approved' as const,
    role: dbRole as 'employee' | 'store_manager' | 'manager' | 'admin' | 'ops_manager' | 'executive',
    employment_type: employmentType,
    approved_by: approver.id,
    approved_at: new Date().toISOString(),
    ...(lastName ? { last_name: lastName.trim(), first_name: (firstName || '').trim() } : {}),
  }).eq('id', employeeId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 監査ログ
  await writeAuditLog({
    action: 'approve_join',
    actorId: approver.id,
    targetId: employeeId,
    details: { role: dbRole, employment_type: employmentType, team_id: effectiveTeamId, target_name: target.name },
  })

  // 2. team_members に追加（設定されている場合のみ）
  if (effectiveTeamId) {
    await db.from('team_members').upsert({ team_id: effectiveTeamId, employee_id: employeeId })
  }

  // 3. チーム（project type）の team_members に追加（設定されている場合のみ）
  if (effectiveProjectTeamId) {
    await db.from('team_members').upsert({ team_id: effectiveProjectTeamId, employee_id: employeeId })
  }

  // 4. 通知送信
  let teamName = ''
  if (effectiveTeamId) {
    const { data: team } = await db.from('teams').select('name').eq('id', effectiveTeamId).single()
    teamName = team?.name ?? ''
  }
  await sendApprovalNotification({
    employee: target,
    teamName,
    approvedBy: approvedBy,
  }).catch(err => console.error('承認通知送信エラー:', err))

  return NextResponse.json({ ok: true })
}
