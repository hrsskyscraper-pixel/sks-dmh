-- store_manager, executive ロールを追加するため、既存のCHECK制約を更新
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'store_manager', 'manager', 'executive', 'admin', 'ops_manager', 'testuser'));
