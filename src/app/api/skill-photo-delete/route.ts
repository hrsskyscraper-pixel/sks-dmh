import { NextRequest, NextResponse } from 'next/server'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister } from '@/lib/permissions'
import { SKILL_PHOTOS_BUCKET } from '@/lib/skill-photos'

// スキル申請写真の削除。管理者以上（canAdminister）のみ許可。
// 添付した本人や一般リーダーは削除できない。
export async function POST(req: NextRequest) {
  const employee = await getCurrentEmployee()
  if (!employee) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  if (!canAdminister(employee)) {
    return NextResponse.json({ error: '写真の削除は管理者のみ可能です' }, { status: 403 })
  }

  const { achievementId, path } = await req.json().catch(() => ({}))
  if (!achievementId || !path || typeof path !== 'string') {
    return NextResponse.json({ error: 'パラメータが不正です' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: ach, error: readErr } = await db
    .from('achievements')
    .select('id, photo_paths')
    .eq('id', achievementId)
    .single()
  if (readErr || !ach) return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })

  const current = (ach.photo_paths ?? []) as string[]
  if (!current.includes(path)) {
    // 既に消えている等。冪等に成功扱い。
    return NextResponse.json({ ok: true, paths: current })
  }
  const next = current.filter(p => p !== path)

  const { error: updErr } = await db.from('achievements').update({ photo_paths: next }).eq('id', achievementId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // ストレージからも削除（ベストエフォート。DB側が正なので失敗しても致命的ではない）
  await db.storage.from(SKILL_PHOTOS_BUCKET).remove([path]).catch(() => {})

  return NextResponse.json({ ok: true, paths: next })
}
