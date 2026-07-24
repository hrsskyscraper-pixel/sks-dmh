import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getExecRoleId, isDevEmp, isExecEmp, isOpsEmp } from '@/lib/improvements'
import {
  notifyImprovementOpsApproved,
  notifyImprovementOpsRejected,
  notifyImprovementExecApproved,
  notifyImprovementExecRejected,
  notifyImprovementDevStarted,
  notifyImprovementCompleted,
} from '@/lib/notifications/improvement'

type Action = 'ops_approve' | 'ops_reject' | 'exec_approve' | 'exec_reject' | 'dev_start' | 'dev_complete'
const now = () => new Date().toISOString()

// 改善提案のワークフロー操作（段階ごとに権限・現ステータスを検証）。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db
    .from('employees')
    .select('id, role, system_permission, business_role_ids')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!me) return NextResponse.json({ error: '権限がありません' }, { status: 403 })

  const { action, comment, proposal } = (await request.json()) as {
    action: Action
    comment?: string
    proposal?: string
  }

  const { data: req } = await db
    .from('improvement_requests')
    .select('id, title, description, requester_id, status, ops_proposal')
    .eq('id', id)
    .maybeSingle()
  if (!req) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })

  const execRoleId = await getExecRoleId()
  const isOps = isOpsEmp(me)
  const isExec = isExecEmp(me, execRoleId)
  const isDev = isDevEmp(me)

  // (更新内容, イベント種別, 通知, 権限, 想定元ステータス) を action ごとに決める
  let update: Record<string, unknown> = {}
  let eventType = ''
  let notifyFn: ((r: { id: string; title: string; description: string; requester_id: string; ops_proposal?: string | null; reject_reason?: string | null; completion_note?: string | null }) => Promise<void>) | null = null
  let allowed = false
  let validFrom: string[] = []

  switch (action) {
    case 'ops_approve':
      allowed = isOps
      validFrom = ['submitted']
      if (!proposal?.trim()) return NextResponse.json({ error: '改善案を入力してください' }, { status: 400 })
      update = { status: 'ops_approved', ops_reviewer_id: me.id, ops_proposal: proposal.trim(), ops_decided_at: now(), updated_at: now() }
      eventType = 'ops_approved'
      notifyFn = notifyImprovementOpsApproved
      break
    case 'ops_reject':
      allowed = isOps
      validFrom = ['submitted']
      if (!comment?.trim()) return NextResponse.json({ error: '却下理由を入力してください' }, { status: 400 })
      update = { status: 'rejected', ops_reviewer_id: me.id, ops_decided_at: now(), rejected_by: me.id, rejected_at: now(), reject_reason: comment.trim(), reject_stage: 'ops', updated_at: now() }
      eventType = 'ops_rejected'
      notifyFn = notifyImprovementOpsRejected
      break
    case 'exec_approve':
      allowed = isExec
      validFrom = ['ops_approved']
      update = { status: 'exec_approved', exec_id: me.id, exec_decided_at: now(), updated_at: now() }
      eventType = 'exec_approved'
      notifyFn = notifyImprovementExecApproved
      break
    case 'exec_reject':
      allowed = isExec
      validFrom = ['ops_approved']
      if (!comment?.trim()) return NextResponse.json({ error: '却下理由を入力してください' }, { status: 400 })
      update = { status: 'rejected', exec_id: me.id, exec_decided_at: now(), rejected_by: me.id, rejected_at: now(), reject_reason: comment.trim(), reject_stage: 'exec', updated_at: now() }
      eventType = 'exec_rejected'
      notifyFn = notifyImprovementExecRejected
      break
    case 'dev_start':
      allowed = isDev
      validFrom = ['exec_approved']
      update = { status: 'in_development', developer_id: me.id, dev_started_at: now(), updated_at: now() }
      eventType = 'dev_started'
      notifyFn = notifyImprovementDevStarted
      break
    case 'dev_complete':
      allowed = isDev
      validFrom = ['in_development', 'exec_approved']
      update = { status: 'completed', developer_id: me.id, completed_at: now(), completion_note: comment?.trim() || null, updated_at: now() }
      eventType = 'completed'
      notifyFn = notifyImprovementCompleted
      break
    default:
      return NextResponse.json({ error: '不正な操作です' }, { status: 400 })
  }

  if (!allowed) return NextResponse.json({ error: 'この操作の権限がありません' }, { status: 403 })
  if (!validFrom.includes(req.status)) {
    return NextResponse.json({ error: `現在の状態（${req.status}）ではこの操作はできません` }, { status: 409 })
  }

  const { error: upErr } = await db.from('improvement_requests').update(update).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await db.from('improvement_request_events').insert({
    request_id: id,
    actor_id: me.id,
    type: eventType,
    comment: (proposal?.trim() || comment?.trim()) ?? null,
  })

  // 通知は最新値で。失敗しても操作は成立させる。
  const { data: fresh } = await db
    .from('improvement_requests')
    .select('id, title, description, requester_id, ops_proposal, reject_reason, completion_note')
    .eq('id', id)
    .single()
  if (fresh && notifyFn) {
    await notifyFn(fresh).catch(e => console.error('改善提案通知エラー:', e))
  }

  return NextResponse.json({ ok: true })
}
