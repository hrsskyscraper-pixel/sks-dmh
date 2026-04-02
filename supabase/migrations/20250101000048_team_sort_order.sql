-- team_members / team_managers に表示順カラム追加
ALTER TABLE team_members ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE team_managers ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
