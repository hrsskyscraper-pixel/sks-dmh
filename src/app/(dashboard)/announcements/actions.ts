'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canApprove, canAdminister } from '@/lib/permissions'

/**
 * 級合格のお知らせを投稿（リーダー以上が「担当チーム」のメンバーに対して）。
 * - announcements に1件作成（表示期限7日）
 * - 本人のキャリア記録（資格）にも自動追加
 */
export async function postGradeAnnouncement(subjectEmployeeId: string, gradeLabel: string): Promise<{ error?: string }> {
  const me = await getCurrentEmployee()
  if (!me) return { error: '認証が必要です' }
  if (!canApprove(me)) return { error: 'お知らせの投稿はリーダー以上のみ可能です' }
  const grade = gradeLabel.trim()
  if (!subjectEmployeeId) return { error: '対象メンバーを選択してください' }
  if (!grade) return { error: '合格内容（例: 接客3級）を入力してください' }

  const db = createAdminClient()

  // 担当チーム（自分が team_manager）のメンバーかを確認（管理者は全員OK）
  if (!canAdminister(me)) {
    const { data: managed } = await db.from('team_managers').select('team_id').eq('employee_id', me.id)
    const managedTeamIds = (managed ?? []).map(m => m.team_id)
    if (managedTeamIds.length === 0) return { error: '担当チームがありません' }
    const { data: members } = await db.from('team_members').select('employee_id').in('team_id', managedTeamIds).eq('employee_id', subjectEmployeeId)
    if (!members || members.length === 0) return { error: '担当チームのメンバーにのみお知らせできます' }
  }

  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { error: annErr } = await db.from('announcements').insert({
    kind: 'grade',
    subject_employee_id: subjectEmployeeId,
    grade_label: grade,
    created_by: me.id,
    expires_at: expires.toISOString(),
  })
  if (annErr) return { error: annErr.message }

  // キャリア記録（資格）にも残す
  await db.from('career_records').insert({
    employee_id: subjectEmployeeId,
    record_type: '資格',
    department: grade,
    occurred_at: now.toISOString().split('T')[0],
    created_by: me.id,
  })

  revalidatePath('/')
  revalidatePath('/announcements')
  return {}
}
