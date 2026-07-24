import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notifyImprovementSubmitted } from '@/lib/notifications/improvement'
import { CATEGORY_OPTIONS } from '@/lib/improvements'

// 改善提案の新規申請。ログイン済み（承認済み）ユーザーなら誰でも可能。
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!me) return NextResponse.json({ error: '権限がありません' }, { status: 403 })

  const { title, description, category } = await request.json()
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: '件名と内容を入力してください' }, { status: 400 })
  }
  const cat = CATEGORY_OPTIONS.includes(category) ? category : null

  const { data: created, error } = await db
    .from('improvement_requests')
    .insert({
      requester_id: me.id,
      title: String(title).trim().slice(0, 200),
      description: String(description).trim().slice(0, 5000),
      category: cat,
      status: 'submitted',
    })
    .select('id, title, description, requester_id')
    .single()
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? '登録に失敗しました' }, { status: 500 })
  }

  await db.from('improvement_request_events').insert({
    request_id: created.id,
    actor_id: me.id,
    type: 'submitted',
  })

  // 通知（運営管理者・開発者へ。申請者に受付連絡）。失敗しても申請は成立させる。
  await notifyImprovementSubmitted(created).catch(e => console.error('改善提案通知エラー:', e))

  return NextResponse.json({ ok: true, id: created.id })
}
