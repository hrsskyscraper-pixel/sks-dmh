import type { AnnouncementItem } from '@/lib/announcements'

/** ISO 日時 → JST の 'YYYY-M-D' キー */
export function jstDayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}

export type AnnouncementEntry =
  | { kind: 'single'; item: AnnouncementItem; date: string }
  | { kind: 'welcomeGroup'; key: string; items: AnnouncementItem[]; date: string }

/** 歓迎カードで名前を並べて出す上限。これを超えると「○○さん他N名」になる */
export const WELCOME_NAMES_MAX = 3

/**
 * 同じ日（JST）に複数の「仲間入り」があれば1枚にまとめる（2026-09-20 決定）。
 * 1件だけの日はそのまま。並び順は入力順（新しい順）を保つ。
 */
export function groupWelcomeItems(items: AnnouncementItem[]): AnnouncementEntry[] {
  const byDay = new Map<string, AnnouncementItem[]>()
  for (const it of items) {
    if (it.kind !== 'welcome') continue
    const k = jstDayKey(it.createdAt)
    ;(byDay.get(k) ?? byDay.set(k, []).get(k)!).push(it)
  }
  const emitted = new Set<string>()
  const out: AnnouncementEntry[] = []
  for (const it of items) {
    if (it.kind !== 'welcome') { out.push({ kind: 'single', item: it, date: it.createdAt }); continue }
    const k = jstDayKey(it.createdAt)
    const group = byDay.get(k) ?? [it]
    if (group.length < 2) { out.push({ kind: 'single', item: it, date: it.createdAt }); continue }
    if (emitted.has(k)) continue
    emitted.add(k)
    const latest = group.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), group[0].createdAt)
    out.push({ kind: 'welcomeGroup', key: `welcome-${k}`, items: group, date: latest })
  }
  return out
}

/** 歓迎グループの見出し文 */
export function welcomeGroupTitle(items: AnnouncementItem[]): string {
  const names = items.map(i => i.subjectName ?? '新しい仲間')
  if (names.length <= WELCOME_NAMES_MAX) return `${names.map(n => `${n}さん`).join('、')}の${names.length}名が仲間入り！`
  return `${names[0]}さん他${names.length - 1}名が仲間入り！`
}
