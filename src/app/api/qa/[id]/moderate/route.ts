import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApprovedEmployee } from '@/lib/qa-server'
import { canModerateQa } from '@/lib/qa'
import { getQaModeratorIds } from '@/lib/settings'
import { writeAuditLog } from '@/lib/audit'

/**
 * Q&A: 不適切な質問・回答を非表示にする／表示に戻す（2026-10-21 原島さん確定 A-8）。
 * 消さずに hidden_at を付ける（戻せる）。できるのは設定画面の「Q&A の投稿を非表示にできる人」だけ。監査ログに残す。
 * body: { hidden: boolean, answerId?: string }（answerId があれば回答、なければ質問）
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedEmployee()
  if ('error' in auth) return auth.error
  const { me } = auth
  const { id } = await params

  if (!canModerateQa(me, await getQaModeratorIds())) {
    return NextResponse.json({ error: '非表示にできるのは、設定で指定された運営の方だけです' }, { status: 403 })
  }
  const { hidden, answerId } = await request.json().catch(() => ({}))
  if (typeof hidden !== 'boolean') return NextResponse.json({ error: '不正な操作です' }, { status: 400 })
  if (answerId !== undefined && typeof answerId !== 'string') return NextResponse.json({ error: '不正な操作です' }, { status: 400 })

  const db = createAdminClient()
  const { data: q } = await db.from('qa_questions').select('id, title, hidden_at').eq('id', id).maybeSingle()
  if (!q) return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 })
  const now = new Date().toISOString()
  const mark = hidden ? { hidden_at: now, hidden_by: me.id } : { hidden_at: null, hidden_by: null }

  if (answerId) {
    const { data: a } = await db.from('qa_answers').select('id, question_id, hidden_at, author_id').eq('id', answerId).maybeSingle()
    if (!a || a.question_id !== q.id) return NextResponse.json({ error: '回答が見つかりません' }, { status: 404 })
    if (!!a.hidden_at === hidden) return NextResponse.json({ ok: true })
    const { error } = await db.from('qa_answers').update(mark).eq('id', a.id)
    if (error) { console.error('Q&A 非表示エラー:', error); return NextResponse.json({ error: '保存できませんでした' }, { status: 500 }) }
    // 一覧の回答数は、見えている回答だけを数える（足し引きではなく数え直す。同時の操作でずれないように）
    const { count } = await db.from('qa_answers').select('id', { count: 'exact', head: true }).eq('question_id', q.id).is('hidden_at', null)
    await db.from('qa_questions').update({ answer_count: count ?? 0, updated_at: now }).eq('id', q.id)
    await writeAuditLog({
      action: hidden ? 'qa_answer_hidden' : 'qa_answer_unhidden',
      actorId: me.id,
      targetId: a.author_id,
      details: { question_id: q.id, question_title: q.title, answer_id: a.id },
    }).catch(console.error)
    return NextResponse.json({ ok: true })
  }

  if (!!q.hidden_at === hidden) return NextResponse.json({ ok: true })
  const { error } = await db.from('qa_questions').update({ ...mark, updated_at: now }).eq('id', q.id)
  if (error) { console.error('Q&A 非表示エラー:', error); return NextResponse.json({ error: '保存できませんでした' }, { status: 500 }) }
  await writeAuditLog({
    action: hidden ? 'qa_question_hidden' : 'qa_question_unhidden',
    actorId: me.id,
    details: { question_id: q.id, question_title: q.title },
  }).catch(console.error)
  return NextResponse.json({ ok: true })
}
