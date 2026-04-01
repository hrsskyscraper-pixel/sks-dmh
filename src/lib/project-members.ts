import { SupabaseClient } from '@supabase/supabase-js'

/**
 * project_teams + team_members から社員→プロジェクトのマッピングを構築
 * 旧 employee_projects テーブルの代替
 */
export async function getEmployeeProjectMapping(db: SupabaseClient | ReturnType<any>) {
  const [{ data: projectTeams }, { data: teamMembers }, { data: teamManagers }] = await Promise.all([
    db.from('project_teams').select('project_id, team_id'),
    db.from('team_members').select('team_id, employee_id'),
    db.from('team_managers').select('team_id, employee_id'),
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
