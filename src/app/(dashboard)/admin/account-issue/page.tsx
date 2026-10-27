export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { canAdminister } from '@/lib/permissions'
import { AccountIssue, type UnclaimedAccount } from '@/components/admin/account-issue'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { ISSUE_EMAIL_DOMAIN } from '@/lib/account-issue'

const daysAgoIso = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

/** 管理者側でのアカウント発行（2026-10-27）。システム管理者のみ */
export default async function AccountIssuePage() {
  // 権限の判定は、view-as の相手ではなく本人で行う
  const employee = await getRealEmployee()
  if (!employee || !canAdminister(employee)) redirect('/')

  const db = createAdminClient()
  const [teamsRes, rolesRes, aliasRes, employees, unclaimedRes] = await Promise.all([
    db.from('teams').select('id, name, type, is_test').in('type', ['store', 'department']).order('name'),
    db.from('business_roles').select('id, name, full_name, standard_permission, sort_order').order('sort_order'),
    db.from('roster_dept_aliases').select('roster_name, team_id'),
    fetchAllRows<{ id: string; name: string; employee_number?: string | null }>((from, to) =>
      db.from('employees').select('id, name, employee_number').order('id').range(from, to)),
    db.from('employees').select('id, name, employment_type, created_at').is('auth_user_id', null)
      .like('email', `%@${ISSUE_EMAIL_DOMAIN}`).is('left_at', null).order('created_at', { ascending: false }).limit(1000),
  ])

  const teams = (teamsRes.data ?? []).filter(t => !t.is_test).map(t => ({ id: t.id, name: t.name, type: t.type }))
  const unclaimedRows = unclaimedRes.data ?? []
  const ids = unclaimedRows.map(e => e.id)
  const claims: { id: string; employee_id: string; expires_at: string; created_at: string }[] = []
  const members: { team_id: string; employee_id: string }[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const [c, m] = await Promise.all([
      db.from('account_claims').select('id, employee_id, expires_at, created_at').in('employee_id', chunk).is('used_at', null).is('revoked_at', null),
      db.from('team_members').select('team_id, employee_id').in('employee_id', chunk),
    ])
    claims.push(...(c.data ?? []))
    members.push(...(m.data ?? []))
  }
  const teamName = new Map(teams.map(t => [t.id, t.name]))
  const unclaimed: UnclaimedAccount[] = unclaimedRows.map(e => {
    const latest = claims.filter(c => c.employee_id === e.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return {
      id: e.id,
      name: e.name,
      employmentType: e.employment_type,
      teams: members.filter(m => m.employee_id === e.id).map(m => teamName.get(m.team_id)).filter((x): x is string => !!x),
      issuedAt: e.created_at,
      claimId: latest?.id ?? null,
      expiresAt: latest?.expires_at ?? null,
    }
  })

  // 最近つながった方（どの Google アカウントでつながったか）。違う方がつないでいないかを、運用管理者が確かめられるように
  const since = daysAgoIso(30)
  const { data: usedClaims } = await db.from('account_claims').select('employee_id, used_at').not('used_at', 'is', null).gte('used_at', since).order('used_at', { ascending: false }).limit(200)
  const usedIds = [...new Set((usedClaims ?? []).map(c => c.employee_id))]
  const { data: usedEmps } = usedIds.length ? await db.from('employees').select('id, name, email').in('id', usedIds.slice(0, 200)) : { data: [] }
  const empById = new Map((usedEmps ?? []).map(e => [e.id, e]))
  const recentlyClaimed = (usedClaims ?? []).flatMap(c => {
    const e = empById.get(c.employee_id)
    return e ? [{ id: e.id, name: e.name, email: e.email, claimedAt: c.used_at! }] : []
  })

  // 依頼（受付中）
  const { data: reqRows } = await db.from('account_requests').select('*').eq('status', 'pending').order('created_at').limit(300)
  const requesterIds = [...new Set((reqRows ?? []).map(r => r.requested_by))]
  const { data: requesters } = requesterIds.length ? await db.from('employees').select('id, name').in('id', requesterIds) : { data: [] }
  const requesterName = new Map((requesters ?? []).map(e => [e.id, e.name]))
  // 依頼した人がリーダーとして担当していない店舗の依頼には、印を付ける（担当外の店舗を選べてしまうため）
  const { data: reqManaged } = requesterIds.length ? await db.from('team_managers').select('employee_id, team_id').in('employee_id', requesterIds) : { data: [] }
  const managedPairs = new Set((reqManaged ?? []).map(m => `${m.employee_id}:${m.team_id}`))
  const { count: openCount } = await db.from('account_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  const requests = (reqRows ?? []).map(r => ({
    id: r.id, lastName: r.last_name, firstName: r.first_name, lastKana: r.last_kana, firstKana: r.first_kana,
    employeeNumber: r.employee_number, employmentType: r.employment_type, teamId: r.team_id, businessRoleIds: r.business_role_ids ?? [],
    hireDate: r.hire_date, note: r.note, requestedBy: requesterName.get(r.requested_by) ?? '', createdAt: r.created_at,
    outsideTeam: !!r.team_id && !managedPairs.has(`${r.requested_by}:${r.team_id}`),
  }))

  return (
    <>
      <TopBar title="アカウントの発行" />
      <AccountIssue
        teams={teams}
        roles={(rolesRes.data ?? []).map(r => ({ id: r.id, name: r.name, fullName: r.full_name, std: r.standard_permission }))}
        aliases={(aliasRes.data ?? []).map(a => ({ rosterName: a.roster_name, teamId: a.team_id }))}
        existing={employees.map(e => ({ name: e.name, employeeNumber: e.employee_number ?? null }))}
        unclaimed={unclaimed}
        recentlyClaimed={recentlyClaimed}
        requests={requests}
        openRequestCount={openCount ?? requests.length}
      />
    </>
  )
}
