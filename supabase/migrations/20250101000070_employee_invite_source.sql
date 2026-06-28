-- =============================================
-- 070_employee_invite_source.sql
-- 「初回ログインは招待リンク経由のみ」「招待経由でも承認待ち」を実現するため、
-- 各アカウントが「誰の・どの招待リンク経由で作られたか」を記録できるようにする。
--   - invited_by    : 招待を発行した権限者（employees.id）
--   - invitation_id : どの招待リンク（team_invitations.id）から来たか
-- 承認者は既存の approved_by / approved_at で分かる。
-- =============================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES team_invitations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_invited_by ON employees (invited_by);
