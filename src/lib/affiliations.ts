import type { SupabaseClient } from '@supabase/supabase-js'

export type Affiliation = { name: string; type: 'store' | 'department' | 'project' }

const TYPE_ORDER: Record<Affiliation['type'], number> = { store: 0, department: 1, project: 2 }

/**
 * 社員の所属（店舗・部署・PJチーム / メンバー+リーダー）と、
 * スキルが属する習得カリキュラム名を解決する。タイムライン・承認センター共通。
 */
export async function getAffiliationsAndCurricula(
  db: SupabaseClient,
  employeeIds: string[],
  skillIds: string[],
): Promise<{ affByEmployee: Record<string, Affiliation[]>; curriculaBySkill: Record<string, string[]> }> {
  const empIds = [...new Set(employeeIds)]
  const sIds = [...new Set(skillIds)]
  const [{ data: tmRows }, { data: tmgRows }, { data: psRows }] = await Promise.all([
    empIds.length ? db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', empIds) : Promise.resolve({ data: [] }),
    empIds.length ? db.from('team_managers').select('employee_id, teams(name, type)').in('employee_id', empIds) : Promise.resolve({ data: [] }),
    sIds.length ? db.from('project_skills').select('skill_id, project_id').in('skill_id', sIds) : Promise.resolve({ data: [] }),
  ])

  type Row = { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }
  const affMap: Record<string, Map<string, Affiliation>> = {}
  const addAff = (rows: Row[]) => {
    for (const r of rows) {
      const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
      if (!t || !['store', 'department', 'project'].includes(t.type)) continue
      ;(affMap[r.employee_id] ??= new Map()).set(t.name, { name: t.name, type: t.type as Affiliation['type'] })
    }
  }
  addAff((tmRows ?? []) as Row[])
  addAff((tmgRows ?? []) as Row[])
  const affByEmployee: Record<string, Affiliation[]> = {}
  for (const [id, m] of Object.entries(affMap)) {
    affByEmployee[id] = [...m.values()].sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.name.localeCompare(b.name, 'ja'))
  }

  const projIdsBySkill: Record<string, string[]> = {}
  const allProjIds = new Set<string>()
  for (const ps of (psRows ?? []) as { skill_id: string; project_id: string }[]) {
    ;(projIdsBySkill[ps.skill_id] ??= []).push(ps.project_id)
    allProjIds.add(ps.project_id)
  }
  const { data: projRows } = allProjIds.size > 0
    ? await db.from('skill_projects').select('id, name').in('id', [...allProjIds])
    : { data: [] as { id: string; name: string }[] }
  const projNameById: Record<string, string> = Object.fromEntries((projRows ?? []).map(p => [p.id, p.name]))
  const curriculaBySkill: Record<string, string[]> = {}
  for (const [sid, pids] of Object.entries(projIdsBySkill)) {
    curriculaBySkill[sid] = [...new Set(pids.map(p => projNameById[p]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
  }

  return { affByEmployee, curriculaBySkill }
}

export const TEAM_TYPE_LABEL: Record<Affiliation['type'], string> = { store: '店舗', department: '部署', project: 'PJ' }
export const TEAM_TYPE_COLOR: Record<Affiliation['type'], string> = {
  store: 'bg-blue-100 text-blue-700',
  department: 'bg-purple-100 text-purple-700',
  project: 'bg-teal-100 text-teal-700',
}
