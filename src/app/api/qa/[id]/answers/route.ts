import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApprovedEmployee } from '@/lib/qa-server'
import { QA_BODY_MAX } from '@/lib/qa'
import { notifyAnswerPosted } from '@/lib/notifications/qa'

// Q&A: 回答を投稿する（承認済みの社員なら誰でも。解決済みの質問にも追記できる）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedEmployee()
  if ('error' in auth) return auth.error
  const { me } = auth
  const { id } = await params

  const { body } = await request.json().catch(() => ({}))
  if (!body?.trim()) return NextResponse.json({ error: '回答を入力してください' }, { status: 400 })

  const db = createAdminClient()
  const { data: q } = await db.from('qa_questions').select('id, title, asker_id, answer_count').eq('id', id).maybeSingle()
  if (!q) return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 })

  const text = String(body).trim().slice(0, QA_BODY_MAX)
  const { data: created, error } = await db
    .from('qa_answers')
    .insert({ question_id: q.id, author_id: me.id, body: text })
    .select('id, body, author_id')
    .single()
  if (error || !created) return NextResponse.json({ error: error?.message ?? '投稿に失敗しました' }, { status: 500 })

  await db.from('qa_questions').update({ answer_count: (q.answer_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', q.id)

  await notifyAnswerPosted(q, created, me.name).catch(e => console.error('Q&A 回答通知エラー:', e))

  return NextResponse.json({ ok: true, id: created.id })
}
