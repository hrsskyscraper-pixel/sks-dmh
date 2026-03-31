import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendJoinRequestNotification } from '@/lib/notifications'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const { employeeId, name, teamId, projectTeamId } = await request.json()
  if (!employeeId || !name || !teamId) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const db = createAdminClient()

  // 本人確認
  const { data: emp } = await db.from('employees').select('id, auth_user_id, status').eq('id', employeeId).single()
  if (!emp || emp.auth_user_id !== user.id) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  if (emp.status === 'approved') {
    return NextResponse.json({ error: '既に承認済みです' }, { status: 400 })
  }

  // チーム存在確認
  const { data: team } = await db.from('teams').select('id, name').eq('id', teamId).single()
  if (!team) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 400 })

  // employee 更新
  const { error: updateError } = await db.from('employees').update({
    name,
    requested_team_id: teamId,
    requested_project_team_id: projectTeamId || null,
  }).eq('id', employeeId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 通知送信（メール・LINE）
  const { data: empUpdated } = await db.from('employees').select('id, name, email, avatar_url').eq('id', employeeId).single()
  if (empUpdated) {
    let projectTeamName: string | undefined
    if (projectTeamId) {
      const { data: pt } = await db.from('teams').select('name').eq('id', projectTeamId).single()
      projectTeamName = pt?.name ?? undefined
    }
    await sendJoinRequestNotification({
      applicant: empUpdated,
      team,
      projectTeamName,
    }).catch(err => console.error('通知送信エラー:', err))
  }

  return NextResponse.json({ ok: true })
}
