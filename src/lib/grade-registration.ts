import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCertName } from '@/lib/milestones'

/**
 * 級の行（milestone_cert を持つスキル）が認定されたときの自動処理。
 * - Myキャリアの社内資格（career_records: record_type='資格', department='[社内]<資格名>'）に追加。既にあれば何もしない
 * - 級合格のお知らせ（announcements kind='grade'）を投稿（表示期限7日）
 *
 * 資格名は certifications マスタと全角・半角を揃えて突き合わせ、マスタ側の表記を採用する
 * （スキル名は「調理3級」、資格は「調理３級」のように表記が揃っていないため）。
 * 呼び出し側は例外を握りつぶしてよい（認定そのものは既に完了しているため）。
 */
export async function registerGradeCertification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  params: { employeeId: string; certName: string; actorId: string },
): Promise<{ registered: boolean; label: string }> {
  const { employeeId, certName, actorId } = params

  const { data: certs } = await db.from('certifications').select('name, is_active')
  const wanted = normalizeCertName(certName)
  const master = (certs ?? []).find((c: { name: string }) => normalizeCertName(c.name) === wanted)
  const label: string = master?.name ?? certName
  const department = `[社内]${label}`

  const { data: existing } = await db
    .from('career_records')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('record_type', '資格')
    .eq('department', department)
    .limit(1)
  if (existing && existing.length > 0) return { registered: false, label }

  const now = new Date()
  await db.from('career_records').insert({
    employee_id: employeeId,
    record_type: '資格',
    department,
    occurred_at: now.toISOString().split('T')[0],
    created_by: actorId,
  })
  await db.from('announcements').insert({
    kind: 'grade',
    subject_employee_id: employeeId,
    grade_label: label,
    created_by: actorId,
    expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  return { registered: true, label }
}
