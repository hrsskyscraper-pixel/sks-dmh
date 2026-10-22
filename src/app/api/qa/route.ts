import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApprovedEmployee } from '@/lib/qa-server'
import { QA_BODY_MAX, QA_QUESTIONS_PER_HOUR, QA_TITLE_MAX } from '@/lib/qa'
import { notifyQuestionPosted } from '@/lib/notifications/qa'

// Q&A: 質問を投稿する（承認済みの社員なら誰でも）
export async function POST(request: Request) {
  const auth = await requireApprovedEmployee()
  if ('error' in auth) return auth.error
  const { me } = auth

  const { title, body } = await request.json().catch(() => ({}))
  if (typeof title !== 'string' || typeof body !== 'string' || !title.trim() || !body.trim()) {
    return NextResponse.json({ error: '件名と内容を入力してください' }, { status: 400 })
  }

  const db = createAdminClient()
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recent } = await db.from('qa_questions').select('id', { count: 'exact', head: true }).eq('asker_id', me.id).gte('created_at', since)
  if ((recent ?? 0) >= QA_QUESTIONS_PER_HOUR) {
    return NextResponse.json({ error: `質問は1時間に${QA_QUESTIONS_PER_HOUR}件までです。時間をおいて投稿してください` }, { status: 429 })
  }
  const { data: created, error } = await db
    .from('qa_questions')
    .insert({ asker_id: me.id, title: String(title).trim().slice(0, QA_TITLE_MAX), body: String(body).trim().slice(0, QA_BODY_MAX) })
    .select('id, title, body, asker_id')
    .single()
  if (error || !created) {
    if (error) console.error('Q&A 質問の投稿に失敗:', error.message)
    return NextResponse.json({ error: '投稿できませんでした。時間をおいてもう一度お試しください' }, { status: 500 })
  }

  // 運営チームへ通知（一括休止に関係なく）。失敗しても投稿は成立させる
  await notifyQuestionPosted(created, me.name).catch(e => console.error('Q&A 質問通知エラー:', e))

  return NextResponse.json({ ok: true, id: created.id })
}
