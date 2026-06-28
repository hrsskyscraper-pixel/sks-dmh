import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { canApprove, canAdminister } from '@/lib/permissions'
import { getTestEmployeeIds } from '@/lib/test-data'
import { getAnnouncementsData } from '@/lib/announcements'
import { ensureMonthlyRankingAnnouncement } from '@/lib/skill-ranking'
import { AnnouncementsFeed } from '@/components/announcements/announcements-feed'

/** ホームの「本日のお知らせ」（表示期限内のもの）。リーダー以上には投稿ボタンも出す。 */
export async function AnnouncementsServer() {
  const me = await getCurrentEmployee()
  if (!me) return null
  const db = createAdminClient()

  // 月が替わっていれば前月のスキル習得数ランキングを自動掲載（未掲載時のみ）
  const testIdsForRanking = await getTestEmployeeIds()
  await ensureMonthlyRankingAnnouncement(db, testIdsForRanking)

  const { items, reactions, comments, reactorNames, reactorAvatars } = await getAnnouncementsData(db, { activeOnly: true })
  const canPost = canApprove(me)

  // 投稿対象メンバー（管理者は全員、リーダーは担当チームのメンバー）
  let postableMembers: { id: string; name: string }[] = []
  if (canPost) {
    const testIds = await getTestEmployeeIds()
    if (canAdminister(me)) {
      const { data: emps } = await db.from('employees').select('id, name').eq('status', 'approved').order('name')
      postableMembers = (emps ?? []).filter(e => !testIds.has(e.id))
    } else {
      const { data: managed } = await db.from('team_managers').select('team_id').eq('employee_id', me.id)
      const teamIds = (managed ?? []).map(m => m.team_id)
      if (teamIds.length > 0) {
        const { data: members } = await db.from('team_members').select('employee_id, employees(id, name)').in('team_id', teamIds)
        const seen = new Set<string>()
        for (const m of (members ?? []) as { employees: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
          const e = Array.isArray(m.employees) ? m.employees[0] : m.employees
          if (e && !seen.has(e.id) && !testIds.has(e.id)) { seen.add(e.id); postableMembers.push(e) }
        }
        postableMembers.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      }
    }
  }

  // 表示するお知らせも無く、投稿もできない（一般メンバー）なら何も出さない
  if (items.length === 0 && !canPost) return null

  return (
    <AnnouncementsFeed
      items={items}
      reactions={reactions}
      comments={comments}
      reactorNames={reactorNames}
      reactorAvatars={reactorAvatars}
      currentEmployeeId={me.id}
      canPost={canPost}
      postableMembers={postableMembers}
    />
  )
}
