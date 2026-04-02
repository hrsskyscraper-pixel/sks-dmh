-- 参加許諾の承認者・承認日時を記録
ALTER TABLE employees ADD COLUMN approved_by UUID REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN approved_at TIMESTAMPTZ;
