-- Instagram URL を employees に追加
ALTER TABLE employees ADD COLUMN IF NOT EXISTS instagram_url TEXT;

-- 目標テーブル
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- 自分の目標は参照・作成・更新可能
CREATE POLICY "goals_select_own" ON goals FOR SELECT
  USING (employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid()));

CREATE POLICY "goals_insert_own" ON goals FOR INSERT
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid()));

CREATE POLICY "goals_update_own" ON goals FOR UPDATE
  USING (employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid()));

-- manager/admin/ops_manager はチームメンバーの目標を閲覧可能
CREATE POLICY "goals_select_manager" ON goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid()
        AND e.role IN ('manager', 'admin', 'ops_manager')
    )
  );

-- インデックス
CREATE INDEX IF NOT EXISTS idx_goals_employee_id ON goals(employee_id);
CREATE INDEX IF NOT EXISTS idx_goals_employee_latest ON goals(employee_id, created_at DESC);
