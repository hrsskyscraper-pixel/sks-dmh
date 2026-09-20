import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApprovedEmployee } from '@/lib/qa-server'
import { QA_BODY_MAX, QA_TITLE_MAX } from '@/lib/qa'
import { notifyQuestionPosted } from '@/lib/notifications/qa'

// Q&A: 質問を投稿する（承認済みの社員なら誰でも）
export async function POST(request: Request) {
  const auth = await requireApprovedEmployee()
  if ('error' in auth) return auth.error
  const { me } = auth

  const { title, body } = await request.json().catch(() => ({}))
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: '件名と内容を入力してください' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: created, error } = await db
    .from('qa_questions')
    .insert({ asker_id: me.id, title: String(title).trim().slice(0, QA_TITLE_MAX), body: String(body).trim().slice(0, QA_BODY_MAX) })
    .select('id, title, body, asker_id')
    .single()
  if (error || !created) return NextResponse.json({ error: error?.message ?? '投稿に失敗しました' }, { status: 500 })

  // 運営チームへ通知（一括休止に関係なく）。失敗しても投稿は成立させる
  await notifyQuestionPosted(created, me.name).catch(e => console.error('Q&A 質問通知エラー:', e))

  return NextResponse.json({ ok: true, id: created.id })
}
