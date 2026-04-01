-- プロジェクト ↔ チーム の紐づけテーブル
CREATE TABLE project_teams (
  project_id UUID NOT NULL REFERENCES skill_projects(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, team_id)
);

-- RLS
ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_teams_select" ON project_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_teams_admin" ON project_teams FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin','ops_manager','executive'))
);

-- employee_projects は残すが今後使わない（後方互換のため）
