-- 社員カルテ: キャリア記録
CREATE TABLE IF NOT EXISTS career_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL, -- '面接', '採用', '育成', '配属', '異動', 'その他'
  occurred_at DATE,
  related_employee_ids UUID[] DEFAULT '{}', -- 関係者（面接官、採用担当、育成担当等）
  department TEXT, -- 配属先・異動先
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE career_records ENABLE ROW LEVEL SECURITY;

-- manager/admin/ops_manager が閲覧・作成可能
CREATE POLICY "career_select_manager" ON career_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.auth_user_id = auth.uid() AND e.role IN ('manager', 'admin', 'ops_manager')));
CREATE POLICY "career_insert_manager" ON career_records FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.auth_user_id = auth.uid() AND e.role IN ('manager', 'admin', 'ops_manager')));
CREATE POLICY "career_update_manager" ON career_records FOR UPDATE
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.auth_user_id = auth.uid() AND e.role IN ('manager', 'admin', 'ops_manager')));
CREATE POLICY "career_delete_manager" ON career_records FOR DELETE
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.auth_user_id = auth.uid() AND e.role IN ('manager', 'admin', 'ops_manager')));

CREATE INDEX IF NOT EXISTS idx_career_records_employee ON career_records(employee_id, occurred_at DESC);
