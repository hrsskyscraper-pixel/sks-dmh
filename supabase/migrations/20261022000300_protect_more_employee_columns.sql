-- 機微列の保護を広げる（2026-10-22 本番前のセキュリティ点検）
-- employees_update_own により、ログイン中の本人は Data API で自分の行を更新できる。
-- これまで保護していなかった列を、本人が直接書き換えられないようにする:
--   left_at（退職日を消してアカウントを戻す）・employee_number（他人の番号を取って名簿取込を横取り）・
--   roster_dept / roster_dept_at（名簿チェックから外れる）・last_login_at・
--   email / line_user_id / line_friend（通知の宛先を他人に向ける）・invited_by / invitation_id
-- アプリはこれらを admin client（auth.uid() が NULL）でだけ書くので、正規の更新には影響しない。
-- ブラウザから本人が書く列（avatar_url・hire_date・intro_dismissed_at など）は対象にしない。
CREATE OR REPLACE FUNCTION protect_employee_sensitive_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- sync_leader_as_member による正規のリーダー権限付与中はバイパス
  IF current_setting('app.leader_grant', true) = 'on' THEN
    RETURN NEW;
  END IF;
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
    NEW.left_at           := OLD.left_at;
    NEW.employee_number   := OLD.employee_number;
    NEW.roster_dept       := OLD.roster_dept;
    NEW.roster_dept_at    := OLD.roster_dept_at;
    NEW.last_login_at     := OLD.last_login_at;
    NEW.email             := OLD.email;
    NEW.line_user_id      := OLD.line_user_id;
    NEW.line_friend       := OLD.line_friend;
    NEW.invited_by        := OLD.invited_by;
    NEW.invitation_id     := OLD.invitation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
