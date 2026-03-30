import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendApprovalNotification } from '@/lib/notifications'
import type { Role } from '@/types/database'

const APPROVAL_ROLES: Role[] = ['store_manager', 'manager', 'admin', 'ops_manager', 'executive']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const db = createAdminClient()

  // 承認者の権限チェック
  const { data: approver } = await db
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!approver || !APPROVAL_ROLES.includes(approver.role as Role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { employeeId, teamId, projectId, employmentType, role, approvedBy } = await request.json()
  if (!employeeId || !teamId || !projectId || !employmentType || !role) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  // store_manager / manager は自分の管理チームのみ承認可能
  const isSystemAdmin = ['admin', 'ops_manager', 'executive'].includes(approver.role)
  if (!isSystemAdmin) {
    const { data: managed } = await db
      .from('team_managers')
      .select('team_id')
      .eq('employee_id', approver.id)
    const managedIds = (managed ?? []).map(m => m.team_id)
    if (!managedIds.includes(teamId)) {
      return NextResponse.json({ error: 'この店舗の承認権限がありません' }, { status: 403 })
    }
    // 店長・マネージャーはロール変更不可（employee のみ）
    if (role !== 'employee') {
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

  // 1. employee を approved に更新
  const { error: updateErr } = await db.from('employees').update({
    status: 'approved',
    role,
    employment_type: employmentType,
  }).eq('id', employeeId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 2. team_members に追加
  await db.from('team_members').upsert({ team_id: teamId, employee_id: employeeId })

  // 3. employee_projects に追加
  await db.from('employee_projects').upsert({ employee_id: employeeId, project_id: projectId })

  // 4. 通知送信
  const { data: team } = await db.from('teams').select('name').eq('id', teamId).single()
  await sendApprovalNotification({
    employee: target,
    teamName: team?.name ?? '',
    approvedBy: approvedBy,
  }).catch(err => console.error('承認通知送信エラー:', err))

  return NextResponse.json({ ok: true })
}
