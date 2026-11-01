export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { canAdminister, isDeveloper } from '@/lib/permissions'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { normName, shownToStore, STAGE_ORDER } from '@/lib/roster-review'
import { hasLeft } from '@/lib/left'
import { RosterReview, type ReviewData } from '@/components/roster-review/roster-review'
import type { RosterReviewBatchRow, RosterReviewItemRow, SystemPermission } from '@/types/database'

/**
 * 在職者の確認（2026-11-01）。関わる人ごとに見えるものを分ける:
 * - 須貝（開発者）・原島さん（運用管理者）: すべての行
 * - 上長（確認ごとに選んだ方）: すべての行（上長の確認の段階から）
 * - 店長（店舗のリーダー）: 自分の店舗に回ってきた行だけ（店長の確認の段階から）
 */
const atLeastStage = (s: string, min: RosterReviewBatchRow['stage']) => STAGE_ORDER.indexOf(s as RosterReviewBatchRow['stage']) >= STAGE_ORDER.indexOf(min)

export default async function RosterReviewPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { batch: batchParam } = await searchParams
  const me = await getRealEmployee()
  if (!me) return null
  const db = createAdminClient()
  const dev = isDeveloper(me)
  const ops = canAdminister(me)

  const [{ data: batchRows }, { data: myTeams }] = await Promise.all([
    db.from('roster_review_batches').select('*').order('created_at', { ascending: false }).limit(20),
    db.from('team_managers').select('team_id, teams!inner(type)').eq('employee_id', me.id),
  ])
  // 店長として見られるのは、リーダーに登録されている「店舗」だけ（部署・プロジェクトのリーダーは対象外）
  const myTeamIds = new Set((myTeams ?? []).filter(t => (t.teams as unknown as { type: string }).type === 'store').map(t => t.team_id))
  const batches = (batchRows ?? []) as RosterReviewBatchRow[]
  const atLeast = (b: RosterReviewBatchRow, s: RosterReviewBatchRow['stage']) => STAGE_ORDER.indexOf(b.stage) >= STAGE_ORDER.indexOf(s)
  // 自分に関係のある確認だけ
  const visible = batches.filter(b => ops || (b.senior_ids.includes(me.id) && atLeast(b, 'senior')) || (myTeamIds.size > 0 && b.stage === 'store'))
  const batch = visible.find(b => b.id === batchParam) ?? visible.find(b => b.stage !== 'done') ?? visible[0]

  if (!batch) {
    return (
      <>
        <TopBar title="在職者の確認" />
        <p className="p-6 text-sm text-gray-500 text-center">いま確認をお願いしているものはありません。</p>
      </>
    )
  }

  const [items, teamsRes, rolesRes, managersRes, commentsRes, signoffsRes, seniorCandRes] = await Promise.all([
    fetchAllRows<RosterReviewItemRow>((from, to) => db.from('roster_review_items').select('*').eq('batch_id', batch.id).order('seq').order('id').range(from, to)),
    db.from('teams').select('id, name, type, is_test').in('type', ['store', 'department']).order('name'),
    db.from('business_roles').select('id, name, full_name, sort_order, standard_permission').order('sort_order'),
    fetchAllRows<{ team_id: string; employee_id: string }>((from, to) => db.from('team_managers').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
    db.from('roster_review_comments').select('id, item_id, author_id, stage, body, created_at').eq('batch_id', batch.id).order('created_at', { ascending: false }).limit(1000),
    db.from('roster_review_signoffs').select('employee_id, approved, comment, updated_at').eq('batch_id', batch.id),
    ops ? db.from('employees').select('id, name, left_at').eq('status', 'approved').in('system_permission', ['ops_admin', 'developer']).order('name') : Promise.resolve({ data: [] as { id: string; name: string; left_at: string | null }[] }),
  ])

  const teams = (teamsRes.data ?? []).filter(t => !t.is_test).map(t => ({ id: t.id, name: t.name, type: t.type as 'store' | 'department' }))
  const storeIds = new Set(teams.filter(t => t.type === 'store').map(t => t.id))
  const ledTeams = new Set(managersRes.map(m => m.team_id).filter(id => storeIds.has(id)))

  // 上長は、上長の確認の段階から全行を見る（それまでは、店長として自分の店舗の行だけ）
  const isSenior = batch.senior_ids.includes(me.id) && atLeast(batch, 'senior')
  const seesAll = ops || isSenior
  const shown = seesAll ? items : items.filter(it => it.confirm_team_id && myTeamIds.has(it.confirm_team_id) && shownToStore(it, ledTeams))
  const shownIds = new Set(shown.map(it => it.id))
  // 店長には、店長の確認の段階からのやりとりだけを出す（下書き・概要の確認のやりとりは出さない）
  const comments = (commentsRes.data ?? []).reverse().filter(c => seesAll || (c.item_id && shownIds.has(c.item_id) && atLeastStage(c.stage, 'store')))

  // 行に出す人（MB のアカウント・回答した人・コメントした人・上長）の名前と、いまの状態
  const baseIds = new Set<string>()
  const empIds = baseIds
  for (const it of shown) { if (it.employee_id) empIds.add(it.employee_id); if (it.store_answered_by) empIds.add(it.store_answered_by); if (it.ops_by) empIds.add(it.ops_by) }
  for (const c of comments) empIds.add(c.author_id)
  if (seesAll) for (const id of batch.senior_ids) empIds.add(id)

  // 同じ名前の MB アカウント（重複アカウントを並べて見比べる）。空白・全角半角の違いは無視する
  const allNames = await fetchAllRows<{ id: string; name: string }>((from, to) => db.from('employees').select('id, name').order('id').range(from, to))
  const dupCand = new Set<string>()
  const nameOf = new Map(allNames.map(e => [e.id, e.name]))
  const byName = new Map<string, string[]>()
  for (const e of allNames) { const k = normName(e.name); if (k) byName.set(k, [...(byName.get(k) ?? []), e.id]) }
  const dupes: ReviewData['dupes'] = {}
  for (const it of shown) {
    const keys = new Set([normName(it.roster.name || [it.roster.last_name, it.roster.first_name].filter(Boolean).join('')), it.employee_id ? normName(nameOf.get(it.employee_id) ?? '') : ''].filter(Boolean))
    const others = [...new Set([...keys].flatMap(k => byName.get(k) ?? []))].filter(id => id !== it.employee_id)
    if (others.length) { dupes[it.id] = others; others.forEach(id => dupCand.add(id)) }
  }

  // 店長には、自分の店舗に所属する同じ名前のアカウントだけを見せる（ほかの店舗の方の情報は出さない）
  if (!seesAll && dupCand.size) {
    const cand = [...dupCand]
    const inMyStore = new Set<string>()
    for (let i = 0; i < cand.length; i += 100) {
      const { data: m } = await db.from('team_members').select('employee_id, team_id').in('employee_id', cand.slice(i, i + 100))
      for (const r of m ?? []) if (myTeamIds.has(r.team_id)) inMyStore.add(r.employee_id)
    }
    for (const k of Object.keys(dupes)) { dupes[k] = dupes[k].filter(id => inMyStore.has(id)); if (!dupes[k].length) delete dupes[k] }
    for (const id of inMyStore) empIds.add(id)
  } else for (const id of dupCand) empIds.add(id)
  const ids = [...empIds]
  const emps: { id: string; name: string; employment_type: string | null; business_role_ids: string[] | null; left_at?: string | null; system_permission: SystemPermission; created_at: string; last_login_at?: string | null; auth_user_id: string | null }[] = []
  const mem: { team_id: string; employee_id: string }[] = []
  const ach: { employee_id: string; status: string }[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const [e, m, a] = await Promise.all([
      db.from('employees').select('id, name, employment_type, business_role_ids, left_at, system_permission, created_at, last_login_at, auth_user_id').in('id', chunk),
      db.from('team_members').select('team_id, employee_id').in('employee_id', chunk),
      // これまでのスキルの申請・認定の数
      fetchAllRows<{ employee_id: string; status: string }>((from, to) => db.from('achievements').select('employee_id, status').in('employee_id', chunk).order('id').range(from, to)),
    ])
    emps.push(...(e.data ?? []))
    mem.push(...(m.data ?? []))
    ach.push(...a)
  }
  // 最終ログイン: MB の利用の記録（2026-10-23 から）と、ログインの記録（認証）の新しい方
  const signIn = new Map<string, string>()
  if (emps.some(e => e.auth_user_id)) {
    for (let page = 1; page <= 20; page++) {
      const { data: au, error: auErr } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (auErr || !au) break
      for (const u of au.users) if (u.last_sign_in_at) signIn.set(u.id, u.last_sign_in_at)
      if (au.users.length < 1000) break
    }
  }
  const lastSeen = (e: { last_login_at?: string | null; auth_user_id: string | null }) => {
    const a = e.last_login_at ?? null, b = e.auth_user_id ? signIn.get(e.auth_user_id) ?? null : null
    return a && b ? (a > b ? a : b) : a ?? b
  }
  const teamName = new Map(teams.map(t => [t.id, t.name]))
  const people: ReviewData['people'] = {}
  for (const e of emps) {
    people[e.id] = {
      name: e.name,
      employment_type: e.employment_type,
      role_ids: e.business_role_ids ?? [],
      team_names: mem.filter(m => m.employee_id === e.id && teamName.has(m.team_id)).map(m => teamName.get(m.team_id)!),
      left: hasLeft(e.left_at),
      permission: e.system_permission,
      created_at: e.created_at,
      last_login_at: lastSeen(e),
      applied: ach.filter(a => a.employee_id === e.id).length,
      certified: ach.filter(a => a.employee_id === e.id && a.status === 'certified').length,
    }
  }
  // 店長には、須貝・原島さんのメモと人事の確認事項・社員番号を見せない（見せるのは、氏名・いまの MB・変更案）
  const itemsOut = shown.map(it => (seesAll ? it : {
    ...it, dev_note: null, ops_preview_note: null, ops_note: null,
    roster: { ...it.roster, check: undefined, answer: undefined, answer_note: undefined, employee_number: undefined, mb_name: undefined, mb_team: undefined },
  }))

  const data: ReviewData = {
    // 原島さんの役（担当者承認・決定・反映）は、この確認の上長ではない運用管理者
    me: { id: me.id, dev, ops: ops && !batch.senior_ids.includes(me.id), senior: isSenior, ledTeamIds: [...myTeamIds] },
    batches: visible.map(b => ({ id: b.id, title: b.title, stage: b.stage })),
    // 店長には、全体の概要（ほかの店舗の様子を含む）を見せない
    batch: seesAll ? batch : { ...batch, overview: null, senior_ids: [] },
    items: itemsOut,
    teams,
    ledTeamIds: [...ledTeams],
    roles: (rolesRes.data ?? []).map(r => ({ id: r.id, name: r.name, fullName: r.full_name, std: r.standard_permission ?? null })),
    people,
    dupes,
    comments,
    signoffs: signoffsRes.data ?? [],
    seniorCandidates: (seniorCandRes.data ?? []).filter(e => !hasLeft(e.left_at) && e.id !== me.id).map(e => ({ id: e.id, name: e.name })),
  }

  return (
    <>
      <TopBar title="在職者の確認" />
      <RosterReview data={data} />
    </>
  )
}
