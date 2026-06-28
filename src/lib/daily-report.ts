import type { SupabaseClient } from '@supabase/supabase-js'

const pad = (n: number) => String(n).padStart(2, '0')

/** 前日(JST)に認定があった日数を、前日から遡って連続でカウント（テスト除外） */
async function calcStreak(db: SupabaseClient, excludedIds: Set<string>, fromMs: number, toMs: number): Promise<number> {
  const since = new Date(toMs - 35 * 24 * 3600 * 1000).toISOString()
  const { data } = await db
    .from('achievements')
    .select('employee_id, certified_at')
    .eq('status', 'certified')
    .gte('certified_at', since)
    .lt('certified_at', new Date(toMs).toISOString())
  const days = new Set<string>()
  for (const r of data ?? []) {
    if (!r.certified_at || excludedIds.has(r.employee_id)) continue
    const j = new Date(Date.parse(r.certified_at) + 9 * 3600 * 1000)
    days.add(`${j.getUTCFullYear()}-${j.getUTCMonth() + 1}-${j.getUTCDate()}`)
  }
  let streak = 0
  let cur = new Date(fromMs + 9 * 3600 * 1000) // 前日 JST の壁時計（UTCフィールドとして保持）
  for (let i = 0; i < 35; i++) {
    const key = `${cur.getUTCFullYear()}-${cur.getUTCMonth() + 1}-${cur.getUTCDate()}`
    if (days.has(key)) { streak++; cur = new Date(cur.getTime() - 24 * 3600 * 1000) } else break
  }
  return streak
}

/**
 * 毎朝のデイリーレポート（前日の承認サマリー）を「本日のお知らせ／タイムライン」に投稿する。
 * 目的: アプリ活用の活性化と、活用者への承認・感謝。前向き・名指し・感謝・招待で構成。
 * period='YYYY-MM-DD'（前日のJST日付）で1日1件に重複防止。テスト・開発者は excludedIds で除外。
 */
export async function ensureDailyReportAnnouncement(
  db: SupabaseClient,
  excludedIds: Set<string>,
  now: Date,
): Promise<{ posted: boolean; period: string }> {
  // 前日(JST)のウィンドウ
  const jstNow = new Date(now.getTime() + 9 * 3600 * 1000)
  const yWall = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - 1))
  const period = `${yWall.getUTCFullYear()}-${pad(yWall.getUTCMonth() + 1)}-${pad(yWall.getUTCDate())}`
  const fromMs = yWall.getTime() - 9 * 3600 * 1000
  const toMs = fromMs + 24 * 3600 * 1000
  const fromISO = new Date(fromMs).toISOString()
  const toISO = new Date(toMs).toISOString()
  const monthDay = `${yWall.getUTCMonth() + 1}月${yWall.getUTCDate()}日`

  // 重複防止
  const { data: existing } = await db.from('announcements').select('id').eq('kind', 'daily').eq('period', period).limit(1)
  if (existing && existing.length > 0) return { posted: false, period }

  // 前日に認定されたスキル
  const { data: certs } = await db
    .from('achievements')
    .select('employee_id, skill_id, certified_by, certified_at, skills(name)')
    .eq('status', 'certified')
    .gte('certified_at', fromISO)
    .lt('certified_at', toISO)
  const certList = (certs ?? []).filter(c => !excludedIds.has(c.employee_id))

  const byEmp: Record<string, { count: number; skill: string }> = {}
  const certifierIds = new Set<string>()
  for (const c of certList) {
    const sk = Array.isArray(c.skills) ? c.skills[0] : c.skills
    const e = (byEmp[c.employee_id] ??= { count: 0, skill: sk?.name ?? '' })
    e.count++
    if (!e.skill && sk?.name) e.skill = sk.name
    if (c.certified_by && !excludedIds.has(c.certified_by)) certifierIds.add(c.certified_by)
  }
  const achieverIds = Object.keys(byEmp)
  const totalCerts = certList.length

  // 前日に申請（挑戦）した人
  const { data: apps } = await db
    .from('achievements')
    .select('employee_id, created_at')
    .gte('created_at', fromISO)
    .lt('created_at', toISO)
  const appsFiltered = (apps ?? []).filter(a => !excludedIds.has(a.employee_id))
  const applicantIds = new Set(appsFiltered.map(a => a.employee_id))
  const appTotal = appsFiltered.length

  // 前日に承認された新メンバー
  const { data: newMembers } = await db
    .from('employees')
    .select('id, name, approved_at')
    .eq('status', 'approved')
    .gte('approved_at', fromISO)
    .lt('approved_at', toISO)
  const newMemberList = (newMembers ?? []).filter(e => !excludedIds.has(e.id))

  // 名前解決（習得者・認定者）
  const nameIds = [...new Set([...achieverIds, ...certifierIds])]
  const { data: emps } = nameIds.length > 0
    ? await db.from('employees').select('id, name').in('id', nameIds)
    : { data: [] as { id: string; name: string }[] }
  const nameById = Object.fromEntries((emps ?? []).map(e => [e.id, e.name]))

  // 習得者の所属店舗/部署（店舗優先、メンバー→担当の順）
  const storeByEmp: Record<string, string> = {}
  if (achieverIds.length > 0) {
    type AffRow = { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }
    const [{ data: tmRows }, { data: tgRows }] = await Promise.all([
      db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', achieverIds),
      db.from('team_managers').select('employee_id, teams(name, type)').in('employee_id', achieverIds),
    ])
    const pick = (rows: AffRow[] | null, wantType: 'store' | 'department') => {
      for (const r of rows ?? []) {
        const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
        if (t?.type === wantType && !storeByEmp[r.employee_id]) storeByEmp[r.employee_id] = t.name
      }
    }
    pick(tmRows as AffRow[], 'store'); pick(tgRows as AffRow[], 'store')
    pick(tmRows as AffRow[], 'department'); pick(tgRows as AffRow[], 'department')
  }

  const quiet = totalCerts === 0 && applicantIds.size === 0 && newMemberList.length === 0

  let title: string
  let body: string
  if (quiet) {
    // 静かな日: 否定形を避け、丁寧で前向きな招待にする
    title = `☀️ 今日のMBレポート（${monthDay}）`
    body = '今日はどんな「できた！」が生まれるでしょうか？\n小さな一歩でも、申請から始まります。あなたの挑戦を応援しています ☆\n\n素敵な１日になりますように (^^)'
  } else {
    title = `☀️ 昨日のMBレポート（${monthDay}）`
    const lines: string[] = []
    lines.push(`昨日は全社で ${totalCerts}件 のスキルが認定されました！`)

    if (achieverIds.length > 0) {
      const ranked = achieverIds
        .map(id => ({ id, ...byEmp[id] }))
        .sort((a, b) => b.count - a.count || (nameById[a.id] ?? '').localeCompare(nameById[b.id] ?? '', 'ja'))
      const top = ranked.slice(0, 8)
      lines.push('')
      lines.push('🏅 スキルを習得した方✨  おめでとうございます！')
      for (const r of top) {
        const nm = nameById[r.id] ?? '仲間'
        const store = storeByEmp[r.id] ? `　${storeByEmp[r.id]}` : ''
        const detail = r.count > 1 ? `（${r.count}件：${r.skill} ほか）` : `（${r.skill}）`
        lines.push(`・${nm}さん${store}${detail}`)
      }
      if (ranked.length > top.length) lines.push(`・…ほか${ranked.length - top.length}名が習得！`)
    }

    if (certifierIds.size > 0) {
      lines.push('')
      lines.push('🤝 認定いただいた方✨ ありがとうございました')
      for (const id of [...certifierIds].slice(0, 8)) {
        lines.push(`・${nameById[id] ?? 'リーダー'}さん`)
      }
    }

    if (applicantIds.size > 0) {
      lines.push('')
      lines.push(`✨ 新しい挑戦 … ${applicantIds.size}名が新しいスキル${appTotal}件を申請しました`)
    }

    if (newMemberList.length > 0) {
      lines.push('')
      lines.push(`🎉 新しい仲間 … ${newMemberList.map(e => `${e.name}さん`).join('、')}が仲間入り！`)
      lines.push('　Mission Board へようこそ！')
    }

    const streak = await calcStreak(db, excludedIds, fromMs, toMs)
    if (streak >= 3) {
      lines.push('')
      lines.push(`🔥 ${streak}日連続で習得が生まれています！`)
    }

    lines.push('')
    lines.push('今日も、あなたの「できた！」をお待ちしています ☆')
    lines.push('')
    lines.push('素敵な１日になりますように (^^)')
    body = lines.join('\n')
  }

  const expires = new Date(now.getTime() + 2 * 24 * 3600 * 1000) // 本日のお知らせには約2日間表示
  try {
    await db.from('announcements').insert({ kind: 'daily', period, title, body, expires_at: expires.toISOString() })
    return { posted: true, period }
  } catch {
    return { posted: false, period }
  }
}
