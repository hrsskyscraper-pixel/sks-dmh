/**
 * 画面に出す「肩書き」の呼び名を、1か所だけで決めるためのモジュール。
 *
 * 呼び名は `employees.role`（旧ロール列）から導く。role は
 * `deriveLegacyRole(system_permission, 業務役職)`（admin/business-roles/actions.ts）の結果が
 * 書き込まれる**派生列**で、権限変更・リーダー登録・参加承認のすべての経路で同時に書かれる。
 * つまり role は「system_permission × 業務役職」の写しであり、表示の材料としては正しい。
 *
 * **権限の判定には使わないこと。** できること／できないことは必ず
 * `lib/permissions.ts` の `canApprove` / `canAdminister` などで判定する
 * （2026-09-29、下部ナビを role で出し分けていたために、リーダー権限があるのに
 *  「承認」タブが出ない人が15名いた）。
 *
 * 将来 role 列を廃止するときは、この getDisplayRole の中身だけを
 * system_permission + business_role_ids から組み立てるように差し替えればよい。
 */
export type DisplayRole = '開発者' | '役員' | '運用管理者' | 'マネジャー' | '店長' | '社員' | 'メイト'

/** 権限設定の画面などで選べる呼び名（並び順もこの通り） */
export const ALL_DISPLAY_ROLES: DisplayRole[] = ['社員', 'メイト', '店長', 'マネジャー', '運用管理者', '役員', '開発者']

/** 一覧の並び順。下ほど広い役割 */
export const DISPLAY_ROLE_ORDER: Record<DisplayRole, number> = {
  '社員':       0,
  'メイト':     1,
  '店長':       2,
  'マネジャー': 3,
  '運用管理者': 4,
  '役員':       5,
  '開発者':     6,
}

/** role / employment_type さえ持っていれば何でも渡せる（画面ごとの型に縛られない） */
type DisplayRoleSource = { role?: string | null; employment_type?: string | null }

/** 社員の「肩書きの呼び名」を返す */
export function getDisplayRole(emp: DisplayRoleSource): DisplayRole {
  if (emp.role === 'admin') return '開発者'
  if (emp.role === 'executive') return '役員'
  if (emp.role === 'ops_manager') return '運用管理者'
  if (emp.role === 'manager') return 'マネジャー'
  if (emp.role === 'store_manager') return '店長'
  return emp.employment_type === 'メイト' ? 'メイト' : '社員'
}

/** 並べ替え用のキー */
export function displayRoleOrderOf(emp: DisplayRoleSource): number {
  return DISPLAY_ROLE_ORDER[getDisplayRole(emp)]
}

/**
 * 参加承認のダイアログで選ぶ「呼び名」の選択肢。
 * value は api/approval が受け取る値で、そこから role と system_permission の両方が決まる。
 * リーダー（店長・マネジャー）は メイト／社員 のみ。店長以上を選べるのは運用管理者・開発者だけ
 * （権限の境界は api/approval/route.ts 側でも検査している）。
 */
export const JOIN_ROLE_OPTIONS_LEADER: { value: string; label: string }[] = [
  { value: 'mate', label: 'メイト' },
  { value: 'employee', label: '社員' },
]

export const JOIN_ROLE_OPTIONS_ADMIN: { value: string; label: string }[] = [
  ...JOIN_ROLE_OPTIONS_LEADER,
  { value: 'store_manager', label: '店長' },
  { value: 'manager', label: 'マネジャー' },
  { value: 'ops_manager', label: '運用管理者' },
  { value: 'executive', label: '役員' },
]
