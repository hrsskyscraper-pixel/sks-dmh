import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTestEmployeeIds } from '@/lib/test-data'

const PAGE = 50

/** タイムラインの「もっと読む」: before より古い認定スキルを次の50件返す（テスト社員除外）。 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const before = searchParams.get('before')
  if (!before) return NextResponse.json({ achievements: [], hasMore: false })

  const db = createAdminClient()
  const { data } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, certified_at, certified_by, skills(name, category)')
    .eq('status', 'certified')
    .not('certified_at', 'is', null)
    .lt('certified_at', before)
    .order('certified_at', { ascending: false })
    .limit(PAGE)

  const testEmpIds = await getTestEmployeeIds()
  const achievements = (data ?? []).filter(a => !testEmpIds.has(a.employee_id))
  return NextResponse.json({ achievements, hasMore: (data ?? []).length === PAGE })
}
