import { createAdminClient } from '@/lib/supabase/admin'
import { SetupRequestCard } from '@/components/dashboard/setup-request-card'

/**
 * 自分が担当（リーダー）するチームに、セットアップ未完了（有効だがフェーズ未設定）の
 * 習得カリキュラムが設定されている場合、リーダーに依頼カードを表示する。
 */
export async function SetupIncompleteNotice({ employeeId }: { employeeId: string }) {
  const db = createAdminClient()

  const { data: mgr } = await db.from('team_managers').select('team_id').eq('employee_id', employeeId)
  const teamIds = [...new Set((mgr ?? []).map(m => m.team_id))]
  if (teamIds.length === 0) return null

  const { data: pt } = await db.from('project_teams').select('project_id, team_id').in('team_id', teamIds)
  const projIds = [...new Set((pt ?? []).map(p => p.project_id))]
  if (projIds.length === 0) return null

  const [{ data: projects }, { data: phaseRows }, { data: teams }, { data: opsRows }] = await Promise.all([
    db.from('skill_projects').select('id, name, is_active').in('id', projIds),
    db.from('project_phases').select('project_id').in('project_id', projIds),
    db.from('teams').select('id, name').in('id', teamIds),
    db.from('employees').select('name').eq('role', 'ops_manager').eq('status', 'approved'),
  ])
  const hasPhases = new Set((phaseRows ?? []).map(r => r.project_id))
  const teamNameById = Object.fromEntries((teams ?? []).map(t => [t.id, t.name]))
  const recipients = (opsRows ?? []).map(o => o.name)

  // セットアップ未完了 = 有効だがフェーズ未設定
  const incomplete = (projects ?? []).filter(p => p.is_active && !hasPhases.has(p.id))
  if (incomplete.length === 0) return null
  const incompleteIds = new Set(incomplete.map(p => p.id))
  const projNameById = Object.fromEntries(incomplete.map(p => [p.id, p.name]))

  const items: { teamName: string; curriculumName: string }[] = []
  const seen = new Set<string>()
  for (const p of pt ?? []) {
    if (!incompleteIds.has(p.project_id)) continue
    const key = `${p.team_id}:${p.project_id}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ teamName: teamNameById[p.team_id] ?? '—', curriculumName: projNameById[p.project_id] ?? '—' })
  }
  if (items.length === 0) return null

  return <SetupRequestCard items={items} recipients={recipients} />
}
