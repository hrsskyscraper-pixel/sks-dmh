import { createAdminClient } from '@/lib/supabase/admin'
import { TimelineFeed } from '@/components/timeline/timeline-feed'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { getTestEmployeeIds } from '@/lib/test-data'

interface Props {
  employeeId: string
  employeeRole: string
}

export async function TimelineServer({ employeeId, employeeRole }: Props) {
  const db = createAdminClient()

  const [
    { data: certifiedAchievements },
    { data: comments },
    { data: reactions },
    { data: employees },
  ] = await Promise.all([
    db.from('achievements')
      .select('id, employee_id, skill_id, certified_at, certified_by, skills(name, category)')
      .eq('status', 'certified')
      .not('certified_at', 'is', null)
      .order('certified_at', { ascending: false })
      .limit(40),
    db.from('achievement_comments')
      .select('id, achievement_id, employee_id, content, created_at')
      .order('created_at'),
    db.from('achievement_reactions')
      .select('id, achievement_id, employee_id, emoji'),
    db.from('employees')
      .select('id, name, avatar_url')
      .order('name'),
  ])

  // テスト社員の投稿・反応・コメントは除外（フィルタ後に表示件数へ絞る）
  const testEmpIds = await getTestEmployeeIds()
  // まとめ表示（同じ人・同じ日）で5グループ前後を出せるよう、少し多めに渡す
  const visibleAchievements = (certifiedAchievements ?? []).filter(a => !testEmpIds.has(a.employee_id)).slice(0, 25)
  const visibleComments = (comments ?? []).filter(c => !testEmpIds.has(c.employee_id))
  const visibleReactions = (reactions ?? []).filter(r => !testEmpIds.has(r.employee_id))

  const employeeMap = Object.fromEntries(
    (employees ?? []).filter(e => !testEmpIds.has(e.id)).map(e => [e.id, e])
  )

  return (
    <div className="px-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">みんなの成長</CardTitle>
            <Link href="/timeline" className="text-xs text-orange-600 hover:underline">
              すべて見る →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <TimelineFeed
            achievements={visibleAchievements}
            comments={visibleComments}
            reactions={visibleReactions}
            employeeMap={employeeMap}
            currentEmployeeId={employeeId}
            compact
          />
        </CardContent>
      </Card>
    </div>
  )
}
