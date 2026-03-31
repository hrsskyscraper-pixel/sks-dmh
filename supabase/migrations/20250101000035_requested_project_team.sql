-- 申請時のチーム（project type）を保存
ALTER TABLE employees ADD COLUMN requested_project_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
