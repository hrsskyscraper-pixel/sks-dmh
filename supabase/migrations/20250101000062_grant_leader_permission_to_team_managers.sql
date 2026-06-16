-- 現在チームのリーダー(team_managers)に登録されているのに「メンバー権限(training_member)」のままの
-- 社員へ「リーダー権限(training_leader)」を一括付与するデータ修正。
--
-- 背景:
--   2026-04-15 の権限分離移行(20250101000055)は、その時点で在籍していた社員にだけ
--   旧 role から system_permission を自動設定した(store_manager/manager → training_leader)。
--   移行後に招待された社員は初期値 training_member 固定で、誰も手動でリーダー権限を
--   上げていなかったため、30店舗中14店舗で「承認できる店長・リーダーが店内に1人もいない」
--   状態になり、承認が上長(運用管理者)に集中していた(秋田の店長からの問い合わせで発覚)。
--
-- dual-write:
--   旧 role 列は Phase 5 まで残るため、business-roles/actions.ts の deriveLegacyRole と
--   同じ規則で同期更新する。training_leader は 業務役職「店長」あり→store_manager / なし→manager。
--   ※ BottomNav の「承認」タブは旧 role で出し分けているため、role の同期が必須。
--
-- 冪等:
--   training_member 以外は対象外。team_managers から外れた人も対象外。再実行しても無害。

UPDATE employees e
SET
  system_permission = 'training_leader',
  role = CASE
    WHEN EXISTS (
      SELECT 1 FROM business_roles br
      WHERE br.id = ANY(e.business_role_ids) AND br.name = '店長'
    ) THEN 'store_manager'
    ELSE 'manager'
  END,
  updated_at = now()
WHERE e.system_permission = 'training_member'
  AND EXISTS (
    SELECT 1 FROM team_managers tm WHERE tm.employee_id = e.id
  );
