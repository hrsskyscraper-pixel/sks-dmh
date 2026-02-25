-- 012_comments_and_rejection.sql
-- スキル申請・認定フローにコメント・差し戻し・未読通知機能を追加

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS apply_comment TEXT,
  ADD COLUMN IF NOT EXISTS certify_comment TEXT,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE achievements DROP CONSTRAINT IF EXISTS achievements_status_check;
ALTER TABLE achievements ADD CONSTRAINT achievements_status_check
  CHECK (status IN ('pending', 'certified', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_achievements_is_read ON achievements(is_read) WHERE is_read = FALSE;

-- 社員が自分のrejectedレコードをpendingに戻せるRLSポリシー
CREATE POLICY "achievements_update_own_reapply" ON achievements
  FOR UPDATE TO authenticated
  USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));
