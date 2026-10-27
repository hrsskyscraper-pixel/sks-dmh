'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister, canApprove } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { hasControlChars, isValidDate, normEmployeeNumber } from '@/lib/account-issue'

export type AccountRequestInput = {
  lastName: string
  firstName: string
  lastKana?: string | null
  firstKana?: string | null
  employeeNumber?: string | null
  employmentType: '社員' | 'メイト' | null
  teamId: string | null
  businessRoleIds: string[]
  hireDate?: string | null
  note?: string | null
}

/**
 * 運用管理者にアカウントの発行を依頼する（2026-10-27）。リーダー以上（承認できる人）が使う。
 * 依頼は運用管理者の「アカウントの発行」画面に並び、社員リストで確かめてから発行される。
 */
export async function createAccountRequest(x: AccountRequestInput): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canApprove(me)) return { error: '権限がありません' }
  const last = x.lastName?.trim() ?? '', first = x.firstName?.trim() ?? ''
  if (!last || last.length > 30 || first.length > 30) return { error: '姓を入れてください（姓・名は30文字まで）' }
  if ((x.lastKana ?? '').length > 60 || (x.firstKana ?? '').length > 60 || (x.note ?? '').length > 500) return { error: 'ふりがなは60文字、メモは500文字までです' }
  if ([x.lastName, x.firstName, x.lastKana, x.firstKana, x.employeeNumber].some(hasControlChars)) return { error: '氏名・ふりがな・社員番号に、使えない文字が入っています' }
  // メモは改行だけ許す（文字の向きを変える記号・ゼロ幅文字などで表示を偽装させない）
  if (hasControlChars((x.note ?? '').replace(/\r?\n/g, ' '))) return { error: 'メモに、使えない文字が入っています' }
  if (x.employmentType && x.employmentType !== '社員' && x.employmentType !== 'メイト') return { error: '区分は社員かメイトを選んでください' }
  if (x.hireDate && !isValidDate(x.hireDate)) return { error: '入社日が日付として正しくありません' }
  if ((x.businessRoleIds ?? []).length > 10) return { error: '役職が多すぎます' }

  const db = createAdminClient()
  if (x.teamId) {
    const { data: team } = await db.from('teams').select('id').eq('id', x.teamId).in('type', ['store', 'department']).maybeSingle()
    if (!team) return { error: '店舗・部署を選び直してください' }
  }
  if (x.businessRoleIds?.length) {
    const { data: roles } = await db.from('business_roles').select('id').in('id', x.businessRoleIds)
    if ((roles ?? []).length !== x.businessRoleIds.length) return { error: '役職を選び直してください' }
  }
  // 1人が受付中にしておける依頼は 20 件まで（運用管理者の画面を埋めさせない）
  const { count: mineOpen } = await db.from('account_requests').select('id', { count: 'exact', head: true }).eq('requested_by', me.id).eq('status', 'pending')
  if ((mineOpen ?? 0) >= 20) return { error: '受付中の依頼が 20 件あります。発行されるまで、お待ちください' }
  // 同じ方の依頼を重ねて出さない（受付中で、両方に社員番号があれば社員番号で、無ければ氏名で）
  const { data: open } = await db.from('account_requests').select('last_name, first_name, employee_number').eq('status', 'pending').limit(1000)
  const num = normEmployeeNumber(x.employeeNumber)
  const nameKey = (a: string, b: string) => (a + b).normalize('NFKC').replace(/\s+/g, '')
  if ((open ?? []).some(r => {
    const rn = normEmployeeNumber(r.employee_number)
    return num && rn ? rn === num : nameKey(r.last_name, r.first_name) === nameKey(last, first)
  })) {
    return { error: 'この方の依頼は、すでに受け付けています' }
  }

  const { data: row, error } = await db.from('account_requests').insert({
    requested_by: me.id,
    last_name: last,
    first_name: first,
    last_kana: x.lastKana?.trim() || null,
    first_kana: x.firstKana?.trim() || null,
    employee_number: num || null,
    employment_type: x.employmentType,
    team_id: x.teamId,
    business_role_ids: x.businessRoleIds ?? [],
    hire_date: x.hireDate || null,
    note: x.note?.trim() || null,
  }).select('id').single()
  if (error || !row) return { error: '依頼を送れませんでした。時間をおいてもう一度お試しください' }
  await writeAuditLog({ action: 'request_account', actorId: me.id, targetId: row.id }).catch(() => {})
  revalidatePath('/account-request')
  revalidatePath('/admin/account-issue')
  return {}
}

/** 依頼を見送る（社員リストにいない・重複など）。システム管理者のみ。理由は依頼した人に見える */
export async function declineAccountRequest(id: string, reason: string): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  const r = reason.trim()
  if (!r || r.length > 300) return { error: '見送る理由を入れてください（300文字まで）' }
  const db = createAdminClient()
  const { data, error } = await db.from('account_requests').update({ status: 'declined', decline_reason: r, handled_by: me.id, handled_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('id')
  if (error || !data?.length) return { error: 'この依頼は、すでに対応済みです' }
  await writeAuditLog({ action: 'decline_account_request', actorId: me.id, targetId: id }).catch(() => {})
  revalidatePath('/account-request')
  revalidatePath('/admin/account-issue')
  return {}
}
