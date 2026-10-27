'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { deriveLegacyRole, standardPermissionOf, widerPermission } from '@/lib/legacy-role'
import { CLAIMABLE_PERMISSIONS, hasControlChars, isValidDate, ISSUABLE_PERMISSIONS, ISSUE_EMAIL_DOMAIN, joinKana, normEmployeeNumber, placeholderEmail } from '@/lib/account-issue'
import type { SystemPermission } from '@/types/database'

export type IssueInput = {
  lastName: string
  firstName: string
  lastKana?: string | null
  firstKana?: string | null
  employeeNumber?: string | null
  employmentType: '社員' | 'メイト'
  teamId: string
  businessRoleIds: string[]
  permission: Extract<SystemPermission, 'training_member' | 'training_leader'>
  hireDate?: string | null
  /** 依頼（account_requests）から発行するときの依頼の id。発行できたら依頼を「発行済み」にする */
  requestId?: string | null
}

export type IssuedAccount = { employeeId: string; name: string; claimId: string }

const PERMISSIONS = new Set<string>(ISSUABLE_PERMISSIONS)

/**
 * 管理者側でアカウントを発行する（2026-10-27）。システム管理者のみ。
 * 社員データを承認済みで作り、店舗・部署のメンバー（リーダー権限ならリーダーにも）に登録し、本人用のログインリンクを作る。
 * 1件ずつ監査ログに残す。途中で止まったときは、それまでに発行した分を返す。
 */
export async function issueAccounts(inputs: IssueInput[], opts: { rosterChecked: boolean; offset?: number }): Promise<{ issued: IssuedAccount[]; error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { issued: [], error: '権限がありません' }
  if (inputs.length === 0) return { issued: [] }
  // 発行する前に、人事の社員リストで確かめたことを必ず確かめる（2026-10-27 須貝さん）
  if (!opts?.rosterChecked) return { issued: [], error: '「人事の社員リストで確認した」にチェックを入れてください' }
  // 1回の処理を短くする（画面は50件ずつに分けて送る）
  if (inputs.length > 50) return { issued: [], error: '一度に発行できるのは50件までです' }
  try {
    return await issueChecked(me.id, inputs, opts.offset ?? 0)
  } finally {
    // 途中で止まっても、発行済みの分が一覧と重複の判定に出るようにする
    revalidatePath('/admin/account-issue')
    revalidatePath('/admin/employees')
  }
}

async function issueChecked(meId: string, inputs: IssueInput[], offset: number): Promise<{ issued: IssuedAccount[]; error?: string }> {

  const db = createAdminClient()
  const [{ data: teams, error: teamErr }, { data: roles, error: roleErr }] = await Promise.all([
    db.from('teams').select('id, type, is_test').in('type', ['store', 'department']),
    db.from('business_roles').select('id, name, is_executive, standard_permission'),
  ])
  if (teamErr || roleErr) return { issued: [], error: '店舗・役職の一覧を読めませんでした。時間をおいてもう一度お試しください' }
  const teamOk = new Set((teams ?? []).filter(t => !t.is_test).map(t => t.id))
  const roleName = new Map((roles ?? []).map(r => [r.id, r.name]))
  const roleById = new Map((roles ?? []).map(r => [r.id, r]))

  // 入力の確かめ（1件でもおかしければ、何も発行しない）
  const numbers = new Set<string>()
  for (const [i, x] of inputs.entries()) {
    const label = `${offset + i + 1}件目（${x.lastName ?? ''} ${x.firstName ?? ''}）`
    const last = x.lastName?.trim() ?? ''
    if (!last || last.length > 30 || (x.firstName ?? '').trim().length > 30) return { issued: [], error: `${label}: 姓を入れてください（姓・名は30文字まで）` }
    if ((x.lastKana ?? '').length > 60 || (x.firstKana ?? '').length > 60) return { issued: [], error: `${label}: ふりがなは60文字までです` }
    if ([x.lastName, x.firstName, x.lastKana, x.firstKana, x.employeeNumber].some(hasControlChars)) return { issued: [], error: `${label}: 氏名・ふりがな・社員番号に、使えない文字が入っています` }
    if (x.employmentType !== '社員' && x.employmentType !== 'メイト') return { issued: [], error: `${label}: 社員かメイトかを選んでください` }
    if (!teamOk.has(x.teamId)) return { issued: [], error: `${label}: 店舗・部署を選んでください` }
    if (!PERMISSIONS.has(x.permission)) return { issued: [], error: `${label}: 承認の権限は、メンバーかリーダーを選んでください` }
    if (x.businessRoleIds.some(id => !roleName.has(id))) return { issued: [], error: `${label}: 役職の一覧にない役職があります` }
    if (x.hireDate && !isValidDate(x.hireDate)) return { issued: [], error: `${label}: 入社日が日付として正しくありません` }
    const num = normEmployeeNumber(x.employeeNumber)
    if (num) {
      if (num.length > 20) return { issued: [], error: `${label}: 社員番号が長すぎます` }
      if (numbers.has(num)) return { issued: [], error: `${label}: 社員番号 ${num} が、ほかの行と重なっています` }
      numbers.add(num)
    }
  }
  if (numbers.size > 0) {
    let data: { id: string; employee_number?: string | null; name: string }[]
    try {
      data = await fetchAllRows((from, to) => db.from('employees').select('id, employee_number, name').not('employee_number', 'is', null).order('id').range(from, to))
    } catch {
      return { issued: [], error: '社員番号を確かめられませんでした。時間をおいてもう一度お試しください' }
    }
    const hit = data.find(e => numbers.has(normEmployeeNumber(e.employee_number)))
    if (hit) return { issued: [], error: `社員番号 ${hit.employee_number} は、すでに ${hit.name} さんに登録されています` }
  }

  const issued: IssuedAccount[] = []
  const now = new Date().toISOString()
  for (const x of inputs) {
    const id = crypto.randomUUID()
    const last = x.lastName.trim(), first = (x.firstName ?? '').trim()
    const titles = x.businessRoleIds.map(r => roleById.get(r)!).filter(Boolean)
    // 役職の標準の承認の権限まで上げる（案B）。発行で付けられるのはリーダーまで（運用管理者は発行後にプロフィールで付ける）
    const std = standardPermissionOf(titles)
    const permission = widerPermission(x.permission, std === 'ops_admin' || std === 'developer' ? 'training_leader' : std) as IssueInput['permission']
    const { error } = await db.from('employees').insert({
      id,
      auth_user_id: null,
      last_name: last,
      first_name: first,
      name: [last, first].filter(Boolean).join(' '),
      name_kana: joinKana(x.lastKana, x.firstKana),
      email: placeholderEmail(id),
      employee_number: normEmployeeNumber(x.employeeNumber) || null,
      employment_type: x.employmentType,
      system_permission: permission,
      business_role_ids: x.businessRoleIds,
      role: deriveLegacyRole(permission, titles),
      hire_date: x.hireDate || null,
      status: 'approved',
      approved_by: meId,
      approved_at: now,
      invited_by: meId,
    })
    if (error) {
      console.error('アカウントの発行に失敗:', error.message)
      return { issued, error: `${last} ${first} さんの行で止まりました（${issued.length}件は発行済み）。時間をおいてもう一度お試しください` }
    }
    // リーダーは team_managers だけ入れる（メンバーの行はトリガ sync_leader_as_member が入れる）。並べて入れると主キーがぶつかる
    const { error: stepErr } = permission === 'training_leader'
      ? await db.from('team_managers').insert({ team_id: x.teamId, employee_id: id, role: 'secondary', sort_order: 999 })
      : await db.from('team_members').insert({ team_id: x.teamId, employee_id: id, sort_order: 999 })
    const { data: claim, error: claimErr } = await db.from('account_claims').insert({ employee_id: id, created_by: meId }).select('id').single()
    if (stepErr || claimErr || !claim) {
      console.error('アカウントの発行（所属・リンク）に失敗:', stepErr?.message ?? claimErr?.message)
      // 作った社員データを消して、この行は発行しなかったことにする（所属・リンクは ON DELETE CASCADE で一緒に消える）
      await db.from('employees').delete().eq('id', id)
      return { issued, error: `${last} ${first} さんの行で止まりました（${issued.length}件は発行済み）。時間をおいてもう一度お試しください` }
    }
    issued.push({ employeeId: id, name: [last, first].filter(Boolean).join(' '), claimId: claim.id })
    await writeAuditLog({
      action: 'issue_account',
      actorId: meId,
      targetId: id,
      details: { team_id: x.teamId, employment_type: x.employmentType, permission, business_role_ids: x.businessRoleIds, roster_checked: true, request_id: x.requestId ?? null },
    }).catch(() => {})
    if (x.requestId) {
      await db.from('account_requests').update({ status: 'issued', issued_employee_id: id, handled_by: meId, handled_at: new Date().toISOString() })
        .eq('id', x.requestId).eq('status', 'pending')
    }
  }
  return { issued }
}

/**
 * 本人用のログインリンクを作り直す（なくした・期限が切れた・違う人に渡した とき）。
 * それまでのリンクは使えなくする。まだログインしていない人だけ。
 */
export async function reissueClaim(employeeId: string): Promise<{ claimId?: string; error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  const db = createAdminClient()
  // 発行した社員データ（仮のアドレス・開発者以外・在籍中）だけ。ほかの行にリンクを作ると、なりすましに使えるため
  const { data: emp } = await db.from('employees').select('id, auth_user_id, email, system_permission, left_at').eq('id', employeeId).maybeSingle()
  if (!emp || !emp.email.endsWith(`@${ISSUE_EMAIL_DOMAIN}`) || !(CLAIMABLE_PERMISSIONS as readonly string[]).includes(emp.system_permission) || emp.left_at) return { error: '発行した社員データではないため、リンクを作れません' }
  if (emp.auth_user_id) return { error: 'この方は、すでにログインしています' }
  const now = new Date().toISOString()
  const { error: revokeErr } = await db.from('account_claims').update({ revoked_at: now }).eq('employee_id', employeeId).is('used_at', null).is('revoked_at', null)
  if (revokeErr) return { error: 'それまでのリンクを止められませんでした。時間をおいてもう一度お試しください' }
  const { data: claim, error } = await db.from('account_claims').insert({ employee_id: employeeId, created_by: me.id }).select('id').single()
  if (error || !claim) return { error: 'リンクを作れませんでした。時間をおいてもう一度お試しください' }
  await writeAuditLog({ action: 'reissue_account_claim', actorId: me.id, targetId: employeeId }).catch(() => {})
  revalidatePath('/admin/account-issue')
  return { claimId: claim.id }
}
