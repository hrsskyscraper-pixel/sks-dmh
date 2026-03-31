-- teams.type に 'department' を追加
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_type_check;
ALTER TABLE teams ADD CONSTRAINT teams_type_check CHECK (type IN ('store', 'project', 'department'));
