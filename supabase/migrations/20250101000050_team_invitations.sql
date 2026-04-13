-- チーム招待テーブル
-- 招待URL: /invite/{id}
-- フェーズ1（既存メンバー招待）と将来のフェーズ2（未アプリ参加者招待）で共有

CREATE TABLE team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  suggested_role text CHECK (suggested_role IN ('mate','employee','store_manager','manager')),
  invited_by uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- フェーズ1: 既存メンバー宛（いずれか指定）
  target_employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  target_email text,
  custom_message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz,
  used_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_target_employee_id ON team_invitations(target_employee_id);
CREATE INDEX idx_team_invitations_expires_at ON team_invitations(expires_at);

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- SELECT: 招待対象者本人、招待者、システム管理者
CREATE POLICY "team_invitations_select" ON team_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid()
        AND (
          e.id = target_employee_id
          OR e.id = invited_by
          OR e.role IN ('admin','ops_manager','executive')
        )
    )
  );

-- INSERT/UPDATE/DELETE はサーバー側 admin client のみ（RLSで全閉）