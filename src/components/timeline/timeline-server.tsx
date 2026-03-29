import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TimelineFeed } from '@/components/timeline/timeline-feed'
import Link from 'next/link'

interface Props {
  employeeId: string
  employeeRole: string
}

export async function TimelineServer({ employeeId, employeeRole }: Props) {
  const db = employeeRole === 'testuser' ? createAdminClient() : await createClient()

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
      .limit(5),
    db.from('achievement_comments')
      .select('id, achievement_id, employee_id, content, created_at')
      .order('created_at'),
    db.from('achievement_reactions')
      .select('id, achievement_id, employee_id, emoji'),
    db.from('employees')
      .select('id, name, avatar_url')
      .order('name'),
  ])

  const employeeMap = Object.fromEntries(
    (employees ?? []).map(e => [e.id, e])
  )

  return (
    <div className="px-4 space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-gray-700">みんなの成長</p>
        <Link href="/timeline" className="text-xs text-orange-600 hover:underline">
          すべて見る →
        </Link>
      </div>
      <TimelineFeed
        achievements={certifiedAchievements ?? []}
        comments={comments ?? []}
        reactions={reactions ?? []}
        employeeMap={employeeMap}
        currentEmployeeId={employeeId}
        compact
      />
    </div>
  )
}
