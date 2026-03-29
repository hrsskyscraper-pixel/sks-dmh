-- スキルごとの標準習得時間（時間単位、NULL=未設定）
ALTER TABLE skills ADD COLUMN IF NOT EXISTS standard_hours INTEGER;
