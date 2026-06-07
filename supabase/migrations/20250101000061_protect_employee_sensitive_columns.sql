-- ============================================================
-- employees: 本人による機微列の自己更新を防ぐ
--
-- 背景:
--   RLS の employees_update_own は「自分の行」を更新可能にしているが、列を
--   限定していないため、理論上メンバーがブラウザクライアント経由で自分の
--   system_permission / role / business_role_ids / employment_type / status /
--   is_test / approved_* / auth_user_id まで書き換えられてしまう（権限昇格）。
--
--   アプリ上、これら機微列の正規の更新はすべて service-role の admin client
--   （承認 API・権限変更アクション等）経由で行われる。service-role の更新では
--   auth.uid() が NULL になる。一方、本人がブラウザ（authenticated）で自分の
--   行を更新する場合は auth.uid() が本人の値になる。
--
--   そこで「auth.uid() が非NULL（＝認証ユーザーによる更新）」の場合は、機微列を
--   常に旧値へ戻す（サイレント）。これにより既存フロー（admin client 経由）は
--   一切影響を受けず、本人の基本プロフィール（氏名・ふりがな・誕生日・SNS 等）の
--   自己編集だけを安全に許可できる。
-- ============================================================

CREATE OR REPLACE FUNCTION protect_employee_sensitive_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.system_permission := OLD.system_permission;
    NEW.role              := OLD.role;
    NEW.business_role_ids := OLD.business_role_ids;
    NEW.employment_type   := OLD.employment_type;
    NEW.status            := OLD.status;
    NEW.is_test           := OLD.is_test;
    NEW.auth_user_id      := OLD.auth_user_id;
    NEW.approved_by       := OLD.approved_by;
    NEW.approved_at       := OLD.approved_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_employee_sensitive_columns ON employees;
CREATE TRIGGER trg_protect_employee_sensitive_columns
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION protect_employee_sensitive_columns();
