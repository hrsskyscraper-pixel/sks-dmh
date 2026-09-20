import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Role, SystemPermission } from '@/types/database'

export type ApiMe = { id: string; name: string; role: Role; system_permission: SystemPermission | null }

/**
 * API ルート用: ログイン済みかつ承認済みの社員を返す。満たさなければエラーレスポンスを返す。
 * （改善提案の API と同じ判定。Q&A は「承認済みなら誰でも」なのでロールは見ない）
 */
export async function requireApprovedEmployee(): Promise<{ me: ApiMe } | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: '未認証' }, { status: 401 }) }
  const db = createAdminClient()
  const { data: me } = await db
    .from('employees')
    .select('id, name, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!me) return { error: NextResponse.json({ error: '権限がありません' }, { status: 403 }) }
  return { me: me as ApiMe }
}
