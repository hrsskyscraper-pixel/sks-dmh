import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

/** 級（1級が最上位） */
export type Grade = 1 | 2 | 3

export interface CertRanks {
  /** 調理階級の最上位（未取得は null） */
  cook: Grade | null
  /** 接客階級の最上位（未取得は null） */
  service: Grade | null
  /** スター保有 */
  star: boolean
  /** 初級保有 */
  beginner: boolean
}

const FULLWIDTH: Record<string, number> = { '１': 1, '２': 2, '３': 3 }

function parseGrade(name: string): Grade | null {
  const m = name.match(/([1-3１-３])級$/)
  if (!m) return null
  const n = FULLWIDTH[m[1]] ?? Number(m[1])
  return n === 1 || n === 2 || n === 3 ? (n as Grade) : null
}

/**
 * 全社員の社内資格ランクを employee_id → CertRanks で返す（リクエスト内キャッシュ）。
 * 社内資格はキャリア記録（record_type='資格'・department='[社内]資格名'）で管理される
 * （employee-career-card と同じ規約）。同一級を複数持つ場合は最上位（数字が小さい方）を採用。
 */
export const getCertRanksByEmployee = cache(
  async (): Promise<Record<string, CertRanks>> => {
    const db = createAdminClient()
    const { data } = await db
      .from('career_records')
      .select('employee_id, department')
      .eq('record_type', '資格')

    const map: Record<string, CertRanks> = {}
    for (const r of data ?? []) {
      if (!r.department?.startsWith('[社内]')) continue
      const name = r.department.replace('[社内]', '')
      const ranks = (map[r.employee_id] ??= {
        cook: null,
        service: null,
        star: false,
        beginner: false,
      })
      if (name === 'スター') {
        ranks.star = true
      } else if (name === '初級') {
        ranks.beginner = true
      } else if (name.startsWith('調理')) {
        const g = parseGrade(name)
        if (g && (ranks.cook === null || g < ranks.cook)) ranks.cook = g
      } else if (name.startsWith('接客')) {
        const g = parseGrade(name)
        if (g && (ranks.service === null || g < ranks.service)) ranks.service = g
      }
    }
    return map
  }
)

/** リングを描画すべき装飾（資格）を持つか。何もなければリング無し。 */
export function hasCertDecoration(r: CertRanks | undefined): r is CertRanks {
  return !!r && (r.star || r.cook !== null || r.service !== null || r.beginner)
}
