import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApprovedEmployee } from '@/lib/qa-server'
import { canResolveQuestion } from '@/lib/qa'

// Q&A: 解決済み ⇄ 回答待ち を切り替える（質問した本人・運用管理者・開発者）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedEmployee()
  if ('error' in auth) return auth.error
  const { me } = auth
  const { id } = await params

  const { status } = await request.json().catch(() => ({}))
  if (status !== 'open' && status !== 'resolved') return NextResponse.json({ error: '不正な状態です' }, { status: 400 })

  const db = createAdminClient()
  const { data: q } = await db.from('qa_questions').select('id, asker_id').eq('id', id).maybeSingle()
  if (!q) return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 })
  if (!canResolveQuestion(me, q)) return NextResponse.json({ error: '解決済みにできるのは、質問した本人と運営チームです' }, { status: 403 })

  const now = new Date().toISOString()
  const { error } = await db
    .from('qa_questions')
    .update(status === 'resolved'
      ? { status, resolved_at: now, resolved_by: me.id, updated_at: now }
      : { status, resolved_at: null, resolved_by: null, updated_at: now })
    .eq('id', q.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
