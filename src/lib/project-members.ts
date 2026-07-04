import { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/**
 * project_teams + team_members から社員→習得カリキュラムのマッピングを構築
 * 旧 employee_projects テーブルの代替
 *
 * @param opts.membersOnly true の場合、team_managers（リーダー）は含めず
 *   team_members（メンバー）のみを対象にする。育成対象（＝メンバー）の判定に使う。
 * @param opts.excludeOptOuts true の場合、curriculum_opt_outs に登録された
 *   (employee_id, project_id)（＝リーダーが「育成対象として参加しない」と設定したカリキュラム）を除外する。
 *   ランキング集計でのみ使う（本人のスキル画面では除外しない）。
 */
export async function getEmployeeProjectMapping(
  db: SupabaseClient | ReturnType<any>,
  opts?: { membersOnly?: boolean; excludeOptOuts?: boolean },
) {
  const membersOnly = opts?.membersOnly ?? false
  const excludeOptOuts = opts?.excludeOptOuts ?? false
  const [projectTeams, teamMembers, teamManagers, optOuts] = await Promise.all([
    fetchAllRows<{ project_id: string; team_id: string }>((from, to) =>
      db.from('project_teams').select('project_id, team_id').order('project_id').order('team_id').range(from, to)),
    fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
      db.from('team_members').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
    membersOnly
      ? Promise.resolve([] as { team_id: string; employee_id: string }[])
      : fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
          db.from('team_managers').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
    excludeOptOuts
      ? fetchAllRows<{ employee_id: string; project_id: string }>((from, to) =>
          db.from('curriculum_opt_outs').select('employee_id, project_id').order('employee_id').order('project_id').range(from, to))
      : Promise.resolve([] as { employee_id: string; project_id: string }[]),
  ])
  const optOutSet = new Set(optOuts.map(o => `${o.employee_id}:${o.project_id}`))

  // team_id → project_ids マップ
  const teamToProjects: Record<string, string[]> = {}
  for (const pt of projectTeams) {
    if (!teamToProjects[pt.team_id]) teamToProjects[pt.team_id] = []
    teamToProjects[pt.team_id].push(pt.project_id)
  }

  // employee_id → project_ids マップ（メンバー + マネージャー）
  const result: { employee_id: string; project_id: string }[] = []
  const seen = new Set<string>()

  for (const tm of [...teamMembers, ...teamManagers]) {
    const projects = teamToProjects[tm.team_id] ?? []
    for (const projectId of projects) {
      const key = `${tm.employee_id}:${projectId}`
      if (seen.has(key)) continue
      if (optOutSet.has(key)) continue // 「育成対象として参加しない」カリキュラムはランキングから除外
      seen.add(key)
      result.push({ employee_id: tm.employee_id, project_id: projectId })
    }
  }

  return result
}
