-- 参加ステータスと希望店舗を追加
ALTER TABLE employees ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved'));
ALTER TABLE employees ADD COLUMN requested_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN line_user_id TEXT UNIQUE;

-- pending ユーザーには RLS でアクセスを制限するため get_current_role を更新
CREATE OR REPLACE FUNCTION get_current_role() RETURNS TEXT AS $$
  SELECT role FROM employees WHERE auth_user_id = auth.uid() AND status = 'approved' LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
