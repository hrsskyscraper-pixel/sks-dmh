-- ============================================================
-- 013_teams.sql
-- チームマスタ・メンバー・担当マネージャー・変更申請テーブルを追加し、
-- employees.store カラムのデータを teams/team_members へ移行して削除する
-- ============================================================

-- チームマスタ
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('store', 'project')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- チームメンバー（社員/メイト ↔ チーム, 多対多）
CREATE TABLE team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, employee_id)
);

-- チーム担当マネージャー（マネージャー ↔ チーム, 多対多）
CREATE TABLE team_managers (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, employee_id)
);

-- 変更申請（manager の編集は ops_manager の承認が必要）
CREATE TABLE team_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES employees(id),
  request_type TEXT NOT NULL CHECK (request_type IN (
    'create_team', 'add_member', 'remove_member', 'add_manager', 'remove_manager'
  )),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- employees.store → teams/team_members データ移行
-- ============================================================

-- store の distinct 値から teams（type='store'）を生成
INSERT INTO teams (name, type)
SELECT DISTINCT store, 'store'
FROM employees
WHERE store IS NOT NULL AND store <> '';

-- store が一致する社員を team_members に INSERT
INSERT INTO team_members (team_id, employee_id)
SELECT t.id, e.id
FROM employees e
JOIN teams t ON t.name = e.store AND t.type = 'store'
WHERE e.store IS NOT NULL AND e.store <> '';

-- employees.store カラムを削除
ALTER TABLE employees DROP COLUMN IF EXISTS store;

-- ============================================================
-- RLS ポリシー
-- ============================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_change_requests ENABLE ROW LEVEL SECURITY;

-- teams: 認証済みユーザーは全件参照可
CREATE POLICY "teams_select" ON teams
  FOR SELECT TO authenticated USING (true);

-- teams: admin/ops_manager のみ INSERT/UPDATE/DELETE
CREATE POLICY "teams_insert" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

CREATE POLICY "teams_update" ON teams
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

CREATE POLICY "teams_delete" ON teams
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

-- team_members: 認証済みユーザーは全件参照可
CREATE POLICY "team_members_select" ON team_members
  FOR SELECT TO authenticated USING (true);

-- team_members: admin/ops_manager のみ INSERT/DELETE
CREATE POLICY "team_members_insert" ON team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

CREATE POLICY "team_members_delete" ON team_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

-- team_managers: 認証済みユーザーは全件参照可
CREATE POLICY "team_managers_select" ON team_managers
  FOR SELECT TO authenticated USING (true);

-- team_managers: admin/ops_manager のみ INSERT/DELETE
CREATE POLICY "team_managers_insert" ON team_managers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

CREATE POLICY "team_managers_delete" ON team_managers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

-- team_change_requests: 本人の申請 + admin/ops_manager は全件参照
CREATE POLICY "team_change_requests_select" ON team_change_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = (
      SELECT id FROM employees WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );

-- team_change_requests: manager 以上が INSERT（自分名義のみ）
CREATE POLICY "team_change_requests_insert" ON team_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (
      SELECT id FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('manager', 'admin', 'ops_manager')
    )
  );

-- team_change_requests: admin/ops_manager のみ UPDATE（status 変更）
CREATE POLICY "team_change_requests_update" ON team_change_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'ops_manager')
    )
  );
