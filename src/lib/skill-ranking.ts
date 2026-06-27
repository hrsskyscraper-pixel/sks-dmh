import type { SupabaseClient } from '@supabase/supabase-js'

export type RankEntry = { employeeId: string; name: string; store: string | null; count: number }

/** 期間内の認定（certified）数を社員ごとに集計してランキング化（テスト除外） */
export async function computeSkillCountRanking(
  db: SupabaseClient,
  fromISO: string,
  toISO: string | null,
  testIds: Set<string>,
  topN = 10,
): Promise<RankEntry[]> {
  let q = db.from('achievements').select('employee_id, certified_at').eq('status', 'certified').gte('certified_at', fromISO)
  if (toISO) q = q.lt('certified_at', toISO)
  const { data } = await q

  const counts: Record<string, number> = {}
  for (const a of data ?? []) {
    if (!a.certified_at || testIds.has(a.employee_id)) continue
    counts[a.employee_id] = (counts[a.employee_id] ?? 0) + 1
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN)
  const ids = ranked.map(([id]) => id)
  if (ids.length === 0) return []

  const { data: emps } = await db.from('employees').select('id, name').in('id', ids)
  const nameById: Record<string, string> = Object.fromEntries((emps ?? []).map(e => [e.id, e.name]))
  const { data: tm } = await db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', ids)
  const storeById: Record<string, string> = {}
  for (const m of (tm ?? []) as { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }[]) {
    const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
    if (t?.type === 'store') storeById[m.employee_id] = t.name
  }

  return ranked.map(([id, count]) => ({ employeeId: id, name: nameById[id] ?? '不明', store: storeById[id] ?? null, count }))
}

/**
 * 前月のスキル習得数ランキングを「本日のお知らせ」に自動掲載（未掲載なら）。
 * ホーム読込時に呼ぶ。period(YYYY-MM)のユニーク制約で重複生成を防ぐ。
 */
export async function ensureMonthlyRankingAnnouncement(db: SupabaseClient, testIds: Set<string>): Promise<void> {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const { data: existing } = await db.from('announcements').select('id').eq('kind', 'ranking').eq('period', period).limit(1)
  if (existing && existing.length > 0) return

  const fromISO = new Date(prev.getFullYear(), prev.getMonth(), 1).toISOString()
  const toISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString() // 当月1日 0:00
  const ranking = await computeSkillCountRanking(db, fromISO, toISO, testIds, 3)
  if (ranking.length === 0) return

  const monthLabel = `${prev.getMonth() + 1}月`
  const top = ranking.map((r, i) => `${i + 1}位 ${r.store ? r.store + 'の ' : ''}${r.name}さん（${r.count}個）`).join('\n')
  const title = `${monthLabel}のスキル習得数ランキングが掲載されました！🏆`
  const body = `TOP3は…\n${top}\nおめでとうございます☆ みんなで🎉を送りましょう！`
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 2週間表示

  try {
    await db.from('announcements').insert({ kind: 'ranking', period, title, body, expires_at: expires.toISOString() })
  } catch {
    // 同時アクセスでの重複(ユニーク制約)は無視
  }
}
