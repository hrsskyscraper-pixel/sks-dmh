-- ============================================================
-- skill_projects.created_by 追加
-- プロジェクトの作成者を記録（既存行は NULL、今後の作成分から記録）
-- ============================================================

ALTER TABLE skill_projects
  ADD COLUMN created_by UUID REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX idx_skill_projects_created_by ON skill_projects(created_by);
