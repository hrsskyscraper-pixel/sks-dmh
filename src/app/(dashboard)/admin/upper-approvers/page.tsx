export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister } from '@/lib/permissions'
import { officialTitleLabel, titleLookupOf } from '@/lib/display-role'
import { getTestEmployeeIds } from '@/lib/test-data'
import { TopBar } from '@/components/layout/nav'
import { UpperApproversView, type UpperRow, type UpperCandidate } from '@/components/admin/upper-approvers'

/** 店舗ごとの「店長の申請を承認する人」（2026-10-21 原島さん確定 B-④-3）。運用管理者・開発者のみ */
export default async function UpperApproversPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')
  if (!canAdminister(employee)) {
    return (
      <>
        <TopBar title="店長の申請を承認する人" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">閲覧権限がありません</p>
          <p className="text-sm text-gray-500 leading-relaxed">この画面は管理者（運用管理者・開発者）のみが閲覧できます。</p>
          <Link href="/" className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium">ホームに戻る</Link>
        </div>
      </>
    )
  }

  const db = createAdminClient()
  const [{ data: stores }, { data: leaders }, { data: uppers }, { data: emps }, testIds, { data: titleRows }] = await Promise.all([
    db.from('teams').select('id, name, is_test').eq('type', 'store').order('name'),
    db.from('team_managers').select('team_id, employee_id'),
    db.from('team_upper_approvers').select('team_id, employee_id'),
    db.from('employees').select('id, name, role, business_role_ids, system_permission, employment_type, status').eq('status', 'approved').order('name'),
    getTestEmployeeIds(),
    db.from('business_roles').select('id, name, sort_order, full_name'),
  ])
  const empById = new Map((emps ?? []).map(e => [e.id, e]))
  const titles = titleLookupOf(titleRows)
  const label = (id: string) => { const e = empById.get(id); return e ? officialTitleLabel(e, titles) : '' }
  const rows: UpperRow[] = (stores ?? []).filter(s => !s.is_test).map(s => ({
    teamId: s.id,
    teamName: s.name,
    leaders: (leaders ?? []).filter(l => l.team_id === s.id && empById.has(l.employee_id) && !testIds.has(l.employee_id))
      .map(l => ({ id: l.employee_id, name: empById.get(l.employee_id)!.name })),
    uppers: (uppers ?? []).filter(u => u.team_id === s.id && empById.has(u.employee_id))
      .map(u => ({ id: u.employee_id, name: empById.get(u.employee_id)!.name, label: label(u.employee_id) })),
  }))
  // 候補: 承認の権限がある人（育成リーダー・運用管理者・開発者）。テスト用は外す
  const candidates: UpperCandidate[] = (emps ?? [])
    .filter(e => ['training_leader', 'ops_admin', 'developer'].includes(e.system_permission ?? '') && !testIds.has(e.id))
    .map(e => ({ id: e.id, name: e.name, label: officialTitleLabel(e, titles) }))

  return (
    <>
      <TopBar title="店長の申請を承認する人" />
      <UpperApproversView rows={rows} candidates={candidates} />
    </>
  )
}
