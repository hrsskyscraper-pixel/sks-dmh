import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { ApprovalManager } from '@/components/approval/approval-manager'
import type { Role } from '@/types/database'
import { canAdminister, canApprove } from '@/lib/permissions'
import { maskEmails } from '@/lib/email-visibility'
import { getTestEmployeeIds } from '@/lib/test-data'

export default async function ApprovalPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')

  const role = employee.role as Role
  // 承認権限が無い人がメール内リンクから来た場合、以前は無言で / にリダイレクトしていたため
  // 「自分のホームに飛ぶ」行き止まりに見えていた。理由が分かる画面を出す。
  if (!canApprove(employee)) {
    return (
      <>
        <TopBar title="参加許諾" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">承認権限がありません</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            参加の承認は、店舗の店長・リーダー、または運用管理者が行います。
            <br />
            承認が必要な場合は、お手数ですがご担当の店長・リーダーまたは運用管理者にご連絡ください。
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
          >
            ホームに戻る
          </Link>
        </div>
      </>
    )
  }

  const db = createAdminClient()

  // この管理者が所属するチーム（store_manager は自分の店舗のみ）
  const isSystemAdmin = canAdminister(employee)

  let managedTeamIds: string[] = []
  if (!isSystemAdmin) {
    // store_manager / manager は team_managers に登録されているチームのみ
    const { data: managed } = await db
      .from('team_managers')
      .select('team_id')
      .eq('employee_id', employee.id)
    managedTeamIds = (managed ?? []).map(m => m.team_id)
  }

  // pending 社員取得
  const pendingQuery = db
    .from('employees')
    .select('id, name, email, avatar_url, requested_team_id, requested_project_team_id, invited_by, created_at')
    .eq('status', 'pending')
    .not('requested_team_id', 'is', null)
    .order('created_at')

  const { data: pendingEmployees } = await pendingQuery

  // テスト社員を除外し、システム管理者でなければ自分の管理チームの依頼のみ表示
  const testEmpIds = await getTestEmployeeIds()
  const filtered = (pendingEmployees ?? [])
    .filter(e => !testEmpIds.has(e.id))
    .filter(e => isSystemAdmin || managedTeamIds.includes(e.requested_team_id!))

  // 招待者名（誰が招待したか）を解決
  const inviterIds = [...new Set(filtered.map(e => e.invited_by).filter((v): v is string => !!v))]
  const { data: inviters } = inviterIds.length > 0
    ? await db.from('employees').select('id, name').in('id', inviterIds)
    : { data: [] as { id: string; name: string }[] }
  const inviterNameById = Object.fromEntries((inviters ?? []).map(i => [i.id, i.name]))

  // メールアドレスは本人とシステム管理者にのみ表示（個人情報保護）。
  // 承認者でもリーダーには参加者のメールを見せない。
  const filteredForClient = maskEmails(filtered, employee).map(e => ({
    ...e,
    inviterName: e.invited_by ? (inviterNameById[e.invited_by] ?? null) : null,
  }))

  // 店舗・部署取得
  const { data: teams } = await db.from('teams').select('id, name, type, prefecture').in('type', ['store', 'department']).order('name')

  // チーム（type=project）取得
  const { data: projectTeams } = await db.from('teams').select('id, name').eq('type', 'project').order('name')

  return (
    <>
      <TopBar title="参加許諾管理" />
      <div className="px-4 py-4">
        <ApprovalManager
          pendingEmployees={filteredForClient}
          teams={teams ?? []}
          projectTeams={projectTeams ?? []}
          currentEmployeeId={employee.id}
          isSystemAdmin={isSystemAdmin}
          approverRole={role}
        />
      </div>
    </>
  )
}
