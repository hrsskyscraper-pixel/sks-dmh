export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { canAdminister, canApprove } from '@/lib/permissions'
import { AccountRequestForm } from '@/components/account-request-form'

/** 運用管理者にアカウントの発行を依頼する（2026-10-27）。リーダー以上 */
export default async function AccountRequestPage() {
  const me = await getRealEmployee()
  if (!me || !canApprove(me)) {
    return (
      <>
        <TopBar title="アカウントの発行の依頼" />
        <p className="p-4 text-sm text-gray-600">この画面は、店長などリーダーの方が使います。新しく入る方がいるときは、店長に伝えてください。</p>
      </>
    )
  }
  const db = createAdminClient()
  const [{ data: teams }, { data: roles }, { data: mine }, { data: managed }] = await Promise.all([
    db.from('teams').select('id, name, is_test').in('type', ['store', 'department']).order('name'),
    db.from('business_roles').select('id, name, sort_order').order('sort_order'),
    db.from('account_requests').select('id, last_name, first_name, status, decline_reason, created_at, handled_at').eq('requested_by', me.id).order('created_at', { ascending: false }).limit(30),
    db.from('team_managers').select('team_id').eq('employee_id', me.id),
  ])
  const managedIds = new Set((managed ?? []).map(m => m.team_id))
  const teamList = (teams ?? []).filter(t => !t.is_test).map(t => ({ id: t.id, name: t.name }))
  return (
    <>
      <TopBar title="アカウントの発行の依頼" />
      <AccountRequestForm
        teams={teamList}
        defaultTeamId={teamList.find(t => managedIds.has(t.id))?.id ?? ''}
        roles={(roles ?? []).map(r => ({ id: r.id, name: r.name }))}
        mine={(mine ?? []).map(r => ({ id: r.id, name: `${r.last_name} ${r.first_name}`.trim(), status: r.status, declineReason: r.decline_reason, createdAt: r.created_at }))}
        isAdmin={canAdminister(me)}
      />
    </>
  )
}
