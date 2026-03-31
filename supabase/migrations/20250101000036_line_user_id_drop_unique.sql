-- テスト環境で同一LINEアカウントを複数社員に紐づけ可能にする
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_line_user_id_key;
