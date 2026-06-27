export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { getAnnouncementsData } from '@/lib/announcements'
import { AnnouncementsFeed } from '@/components/announcements/announcements-feed'

export default async function AnnouncementsPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')
  const db = createAdminClient()
  const { items, reactions, reactorNames } = await getAnnouncementsData(db, { limit: 100 })

  return (
    <>
      <TopBar title="お知らせ" />
      <div className="px-4 py-2">
        <AnnouncementsFeed
          items={items}
          reactions={reactions}
          reactorNames={reactorNames}
          currentEmployeeId={me.id}
          canPost={false}
          title="過去のお知らせ"
          showPastLink={false}
        />
      </div>
    </>
  )
}
