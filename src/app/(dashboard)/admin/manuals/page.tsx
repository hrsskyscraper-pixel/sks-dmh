import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { ManualManager } from '@/components/admin/manual-manager'
import { canAdminister } from '@/lib/permissions'

export default async function ManualsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')
  if (!canAdminister(currentEmployee)) redirect('/')

  const db = createAdminClient()
  const [
    { data: manuals },
    { data: skills },
    { data: skillManuals },
  ] = await Promise.all([
    db.from('manual_library').select('*').order('archived').order('title'),
    db.from('skills').select('id, name, category, order_index').order('order_index'),
    db.from('skill_manuals').select('*'),
  ])

  return (
    <>
      <TopBar title="マニュアル連携" />
      <ManualManager
        manuals={manuals ?? []}
        skills={skills ?? []}
        skillManuals={skillManuals ?? []}
      />
    </>
  )
}
