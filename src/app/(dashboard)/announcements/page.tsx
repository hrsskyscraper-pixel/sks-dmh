export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { getAnnouncementsData, getViewerTeamIds } from '@/lib/announcements'
import { canAdminister } from '@/lib/permissions'
import { AnnouncementsFeed } from '@/components/announcements/announcements-feed'

export default async function AnnouncementsPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')
  const db = createAdminClient()
  // ホームと同じく、店長からの一言は自分に関係あるものだけ
  const viewer = { id: me.id, teamIds: await getViewerTeamIds(db, me.id), isAdmin: canAdminister(me) }
  const { items, reactions, comments, reactorNames, reactorAvatars } = await getAnnouncementsData(db, { limit: 100, viewer })

  return (
    <>
      <TopBar title="お知らせ" />
      <div className="px-4 py-2">
        <AnnouncementsFeed
          items={items}
          reactions={reactions}
          comments={comments}
          reactorNames={reactorNames}
          reactorAvatars={reactorAvatars}
          currentEmployeeId={me.id}
          canPost={false}
          title="過去のお知らせ"
          showPastLink={false}
        />
      </div>
    </>
  )
}
