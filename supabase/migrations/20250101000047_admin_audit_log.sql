-- 管理操作の監査ログ
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,           -- 'approve_join', 'change_role', 'change_team', etc.
  actor_id UUID NOT NULL REFERENCES employees(id),
  target_id UUID REFERENCES employees(id),
  details JSONB DEFAULT '{}',     -- { old_role, new_role, team_name, etc. }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_actor ON admin_audit_log(actor_id);
CREATE INDEX idx_audit_log_target ON admin_audit_log(target_id);

-- RLS
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 承認権限者は全件閲覧可能
CREATE POLICY "approval_roles_can_read_audit" ON admin_audit_log
  FOR SELECT USING (true);

-- service_role のみ挿入可能
CREATE POLICY "service_role_can_insert_audit" ON admin_audit_log
  FOR INSERT WITH CHECK (true);
