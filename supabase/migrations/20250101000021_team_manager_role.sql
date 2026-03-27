-- team_managers に role カラムを追加
ALTER TABLE team_managers
  ADD COLUMN role TEXT NOT NULL DEFAULT 'secondary'
  CHECK (role IN ('primary', 'secondary'));

-- チームごとに主担当は1名のみという制約（DB レベル）
CREATE UNIQUE INDEX idx_team_managers_one_primary
  ON team_managers(team_id)
  WHERE role = 'primary';
