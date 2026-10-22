import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TimelineFeed } from '@/components/timeline/timeline-feed'
import { getTestEmployeeIds } from '@/lib/test-data'
import { getAnnouncementsData } from '@/lib/announcements'

export const dynamic = 'force-dynamic'

type TimelineSearch = { date?: string; achiever?: string; certifier?: string; praiser?: string }

/**
 * デイリーレポートの名前リンクからの絞り込み（2026-09-20 決定）。
 * date=YYYY-MM-DD（JST）と、achiever（習得した人）／certifier（認定した人）／praiser（一言を贈った人）のどれか1つ。
 * 絞り込み中はバナーを出し、「解除して全部見る」で通常のタイムラインに戻る。
 */
function parseFilter(sp: TimelineSearch | undefined) {
  if (!sp?.date || !/^\d{4}-\d{2}-\d{2}$/.test(sp.date)) return null
  const who = sp.achiever ? { kind: 'achiever' as const, id: sp.achiever }
    : sp.certifier ? { kind: 'certifier' as const, id: sp.certifier }
      : sp.praiser ? { kind: 'praiser' as const, id: sp.praiser }
        : null
  if (!who || !/^[0-9a-f-]{36}$/.test(who.id)) return null
  const fromMs = Date.parse(`${sp.date}T00:00:00+09:00`)
  if (Number.isNaN(fromMs)) return null
  return { date: sp.date, who, fromISO: new Date(fromMs).toISOString(), toISO: new Date(fromMs + 24 * 3600 * 1000).toISOString() }
}

export default async function TimelinePage({ searchParams }: { searchParams?: Promise<TimelineSearch> }) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const db = createAdminClient()
  const filter = parseFilter(await searchParams)

  // 認定の取得: 通常は新しい順 50件。絞り込み中は その日・その人（習得者 or 認定者）の分を全部
  let achQuery = db.from('achievements')
    .select('id, employee_id, skill_id, certified_at, certified_by, skills(name, category)')
    .eq('status', 'certified')
    .not('certified_at', 'is', null)
    .order('certified_at', { ascending: false })
  if (filter && filter.who.kind === 'achiever') achQuery = achQuery.gte('certified_at', filter.fromISO).lt('certified_at', filter.toISO).eq('employee_id', filter.who.id).limit(500)
  else if (filter && filter.who.kind === 'certifier') achQuery = achQuery.gte('certified_at', filter.fromISO).lt('certified_at', filter.toISO).eq('certified_by', filter.who.id).limit(500)
  else if (filter) achQuery = achQuery.limit(0)
  else achQuery = achQuery.limit(50)

  const [
    { data: certifiedAchievements },
    { data: comments },
    { data: reactions },
    { data: employees },
  ] = await Promise.all([
    achQuery,
    db.from('achievement_comments')
      .select('id, achievement_id, employee_id, content, created_at')
      .order('created_at'),
    db.from('achievement_reactions')
      .select('id, achievement_id, employee_id, emoji'),
    db.from('employees')
      .select('id, name, avatar_url')
      .order('name'),
  ])

  // お知らせ（級合格・ランキング・歓迎・一言）もタイムラインに流す（タイムラインは全社分。絞り込み中は一言だけ）
  const annData = await getAnnouncementsData(db, {})
  const anns = filter
    ? (filter.who.kind === 'praiser'
      ? annData.items.filter(a => a.kind === 'praise' && a.createdById === filter.who.id && a.createdAt >= filter.fromISO && a.createdAt < filter.toISO)
      : [])
    : annData.items
  const { reactions: annReactions, comments: annComments, reactorNames: annReactorNames, reactorAvatars: annReactorAvatars } = annData

  // テスト社員の投稿・反応・コメントは除外
  const testEmpIds = await getTestEmployeeIds()
  const rawCount = (certifiedAchievements ?? []).length
  const visibleAchievements = (certifiedAchievements ?? []).filter(a => !testEmpIds.has(a.employee_id))
  const visibleComments = (comments ?? []).filter(c => !testEmpIds.has(c.employee_id))
  const visibleReactions = (reactions ?? []).filter(r => !testEmpIds.has(r.employee_id))

  const employeeMap = Object.fromEntries(
    (employees ?? []).filter(e => !testEmpIds.has(e.id)).map(e => [e.id, e])
  )

  // 所属（店舗・部署・PJチーム）と、習得したスキルが属する習得カリキュラムを取得
  const empIds = [...new Set(visibleAchievements.map(a => a.employee_id))]
  const skillIds = [...new Set(visibleAchievements.map(a => a.skill_id))]
  const [{ data: tmRows }, { data: tmgRows }, { data: psRows }] = await Promise.all([
    empIds.length ? db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', empIds) : Promise.resolve({ data: [] }),
    empIds.length ? db.from('team_managers').select('employee_id, teams(name, type)').in('employee_id', empIds) : Promise.resolve({ data: [] }),
    skillIds.length ? db.from('project_skills').select('skill_id, project_id').in('skill_id', skillIds) : Promise.resolve({ data: [] }),
  ])

  type Aff = { name: string; type: 'store' | 'department' | 'project' }
  const TYPE_ORDER: Record<Aff['type'], number> = { store: 0, department: 1, project: 2 }
  const affMap: Record<string, Map<string, Aff>> = {}
  const addAff = (rows: { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }[]) => {
    for (const r of rows) {
      const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
      if (!t || !['store', 'department', 'project'].includes(t.type)) continue
      ;(affMap[r.employee_id] ??= new Map()).set(t.name, { name: t.name, type: t.type as Aff['type'] })
    }
  }
  addAff((tmRows ?? []) as Parameters<typeof addAff>[0])
  addAff((tmgRows ?? []) as Parameters<typeof addAff>[0])
  const affByEmployee: Record<string, Aff[]> = {}
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

  // 絞り込みバナーの文言
  let filterLabel: string | null = null
  if (filter) {
    const who = (employees ?? []).find(e => e.id === filter.who.id)?.name ?? '該当の方'
    const md = `${Number(filter.date.slice(5, 7))}/${Number(filter.date.slice(8, 10))}`
    filterLabel = filter.who.kind === 'achiever' ? `${md} に ${who}さんが習得したスキル`
      : filter.who.kind === 'certifier' ? `${md} に ${who}さんが認定したスキル`
        : `${md} に ${who}さんが贈ったメッセージ`
  }

  return (
    <>
      <TopBar title="タイムライン" />
      <TimelineFeed
        achievements={visibleAchievements}
        comments={visibleComments}
        reactions={visibleReactions}
        employeeMap={employeeMap}
        currentEmployeeId={currentEmployee.id}
        affByEmployee={affByEmployee}
        curriculaBySkill={curriculaBySkill}
        announcements={anns}
        annReactions={annReactions}
        annComments={annComments}
        reactorNames={annReactorNames}
        reactorAvatars={annReactorAvatars}
        hasMore={!filter && rawCount === 50}
        filterLabel={filterLabel}
      />
    </>
  )
}
