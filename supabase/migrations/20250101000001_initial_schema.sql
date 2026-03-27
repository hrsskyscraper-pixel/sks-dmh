-- =============================================
-- できました表 Webシステム - 初期スキーマ
-- =============================================

-- 社員テーブル
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  hire_date DATE,
  store TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- スキル項目テーブル
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('4月', '5月〜6月', '7月〜8月')),
  category TEXT NOT NULL CHECK (category IN ('接客', '調理', '管理', 'その他')),
  order_index INTEGER NOT NULL DEFAULT 0,
  target_date_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- できました記録テーブル
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'certified')),
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certified_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  certified_at TIMESTAMPTZ,
  cumulative_hours_at_achievement NUMERIC(6, 1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, skill_id)
);

-- 労働時間テーブル（CSVインポート）
CREATE TABLE IF NOT EXISTS work_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  hours NUMERIC(4, 1) NOT NULL CHECK (hours >= 0 AND hours <= 24),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, work_date)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_achievements_employee_id ON achievements(employee_id);
CREATE INDEX IF NOT EXISTS idx_achievements_skill_id ON achievements(skill_id);
CREATE INDEX IF NOT EXISTS idx_achievements_status ON achievements(status);
CREATE INDEX IF NOT EXISTS idx_work_hours_employee_id ON work_hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_hours_work_date ON work_hours(work_date);
CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id ON employees(auth_user_id);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 累計労働時間取得関数
CREATE OR REPLACE FUNCTION get_employee_cumulative_hours(
  p_employee_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(hours), 0)
  FROM work_hours
  WHERE employee_id = p_employee_id
    AND work_date <= p_as_of_date;
$$ LANGUAGE SQL STABLE;

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_hours ENABLE ROW LEVEL SECURITY;

-- Helper関数: ログインユーザーのemployee情報を取得
CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS employees AS $$
  SELECT * FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_role()
RETURNS TEXT AS $$
  SELECT role FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ---- skills: 認証済みユーザーは全員閲覧可 ----
CREATE POLICY "skills_select_authenticated" ON skills
  FOR SELECT TO authenticated USING (true);

-- ---- employees ----
-- 自分のレコードは閲覧可
CREATE POLICY "employees_select_own" ON employees
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- manager/admin は全員閲覧可
CREATE POLICY "employees_select_manager" ON employees
  FOR SELECT TO authenticated
  USING (get_current_role() IN ('manager', 'admin'));

-- 自分のレコードは更新可
CREATE POLICY "employees_update_own" ON employees
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid());

-- admin のみ全件更新可
CREATE POLICY "employees_update_admin" ON employees
  FOR UPDATE TO authenticated
  USING (get_current_role() = 'admin');

-- 初回ログイン時: 自分のレコードは自分で作成可
CREATE POLICY "employees_insert_own" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- admin は他ユーザーの挿入も可
CREATE POLICY "employees_insert_admin" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (get_current_role() = 'admin');

-- ---- achievements ----
-- 自分の記録は閲覧可
CREATE POLICY "achievements_select_own" ON achievements
  FOR SELECT TO authenticated
  USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

-- manager/admin は全員閲覧可
CREATE POLICY "achievements_select_manager" ON achievements
  FOR SELECT TO authenticated
  USING (get_current_role() IN ('manager', 'admin'));

-- 自分の記録は申請可
CREATE POLICY "achievements_insert_own" ON achievements
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

-- manager/admin は認定可（UPDATE）
CREATE POLICY "achievements_update_manager" ON achievements
  FOR UPDATE TO authenticated
  USING (get_current_role() IN ('manager', 'admin'));

-- ---- work_hours ----
-- 自分の労働時間は閲覧可
CREATE POLICY "work_hours_select_own" ON work_hours
  FOR SELECT TO authenticated
  USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

-- manager/admin は全員閲覧可
CREATE POLICY "work_hours_select_manager" ON work_hours
  FOR SELECT TO authenticated
  USING (get_current_role() IN ('manager', 'admin'));

-- manager/admin のみCSVインポート可
CREATE POLICY "work_hours_insert_manager" ON work_hours
  FOR INSERT TO authenticated
  WITH CHECK (get_current_role() IN ('manager', 'admin'));

CREATE POLICY "work_hours_upsert_manager" ON work_hours
  FOR UPDATE TO authenticated
  USING (get_current_role() IN ('manager', 'admin'));
