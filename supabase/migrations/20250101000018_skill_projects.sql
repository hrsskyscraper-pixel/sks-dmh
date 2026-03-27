-- ============================================================
-- 017_skill_projects.sql
-- スキルアッププロジェクト機能: 新テーブル作成
-- ============================================================

-- プロジェクトマスタ
CREATE TABLE skill_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- フェーズ定義
CREATE TABLE project_phases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES skill_projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  end_hours   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- プロジェクト×スキル紐づけ
CREATE TABLE project_skills (
  project_id       UUID NOT NULL REFERENCES skill_projects(id) ON DELETE CASCADE,
  skill_id         UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  project_phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, skill_id)
);

-- 社員×プロジェクト参加
CREATE TABLE employee_projects (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES skill_projects(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, project_id)
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE skill_projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_skills   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_projects ENABLE ROW LEVEL SECURITY;

-- skill_projects: 全員参照可、admin/ops_manager のみ変更可
CREATE POLICY "skill_projects_select" ON skill_projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "skill_projects_insert" ON skill_projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "skill_projects_update" ON skill_projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "skill_projects_delete" ON skill_projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

-- project_phases
CREATE POLICY "project_phases_select" ON project_phases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "project_phases_insert" ON project_phases
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "project_phases_update" ON project_phases
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "project_phases_delete" ON project_phases
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

-- project_skills
CREATE POLICY "project_skills_select" ON project_skills
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "project_skills_insert" ON project_skills
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "project_skills_update" ON project_skills
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "project_skills_delete" ON project_skills
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

-- employee_projects
CREATE POLICY "employee_projects_select" ON employee_projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "employee_projects_insert" ON employee_projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "employee_projects_update" ON employee_projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));

CREATE POLICY "employee_projects_delete" ON employee_projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin', 'ops_manager')
  ));
