-- 通知既読タイムスタンプ（このタイムスタンプ以前の通知は既読扱い）
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notifications_read_at TIMESTAMPTZ;
