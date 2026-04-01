import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const achievementId = url.searchParams.get('id')
  if (!achievementId) return NextResponse.json([])

  const db = createAdminClient()
  const { data } = await db
    .from('achievement_history')
    .select('id, action, actor_id, comment, created_at')
    .eq('achievement_id', achievementId)
    .order('created_at')

  if (!data || data.length === 0) return NextResponse.json([])

  // actor の名前とアバターを取得
  const actorIds = [...new Set(data.map(h => h.actor_id))]
  const { data: actors } = await db
    .from('employees')
    .select('id, name, avatar_url')
    .in('id', actorIds)
  const actorMap = Object.fromEntries((actors ?? []).map(a => [a.id, a]))

  const result = data.map(h => ({
    id: h.id,
    action: h.action,
    actor_id: h.actor_id,
    actor_name: actorMap[h.actor_id]?.name ?? '不明',
    actor_avatar: actorMap[h.actor_id]?.avatar_url ?? null,
    comment: h.comment,
    created_at: h.created_at,
  }))

  return NextResponse.json(result)
}
