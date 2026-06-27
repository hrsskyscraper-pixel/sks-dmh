import { SupabaseClient } from '@supabase/supabase-js'

/**
 * project_teams + team_members から社員→習得カリキュラムのマッピングを構築
 * 旧 employee_projects テーブルの代替
 *
 * @param opts.membersOnly true の場合、team_managers（リーダー）は含めず
 *   team_members（メンバー）のみを対象にする。育成対象（＝メンバー）の判定に使う。
 */
export async function getEmployeeProjectMapping(
  db: SupabaseClient | ReturnType<any>,
  opts?: { membersOnly?: boolean },
) {
  const membersOnly = opts?.membersOnly ?? false
  const [{ data: projectTeams }, { data: teamMembers }, { data: teamManagers }] = await Promise.all([
    db.from('project_teams').select('project_id, team_id'),
    db.from('team_members').select('team_id, employee_id'),
    membersOnly
      ? Promise.resolve({ data: [] as { team_id: string; employee_id: string }[] })
      : db.from('team_managers').select('team_id, employee_id'),
  ])

  // team_id → project_ids マップ
  const teamToProjects: Record<string, string[]> = {}
  for (const pt of projectTeams ?? []) {
    if (!teamToProjects[pt.team_id]) teamToProjects[pt.team_id] = []
    teamToProjects[pt.team_id].push(pt.project_id)
  }

  // employee_id → project_ids マップ（メンバー + マネージャー）
  const result: { employee_id: string; project_id: string }[] = []
  const seen = new Set<string>()

  for (const tm of [...(teamMembers ?? []), ...(teamManagers ?? [])]) {
    const projects = teamToProjects[tm.team_id] ?? []
    for (const projectId of projects) {
      const key = `${tm.employee_id}:${projectId}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ employee_id: tm.employee_id, project_id: projectId })
      }
    }
  }

  return result
}
