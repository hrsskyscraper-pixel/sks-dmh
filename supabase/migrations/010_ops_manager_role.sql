-- 運用管理者ロールを追加
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'admin', 'ops_manager'));
