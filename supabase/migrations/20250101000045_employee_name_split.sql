-- ========================================
-- employees テーブルに last_name / first_name を追加
-- name は trigger で自動同期
-- ========================================

-- 1. カラム追加
ALTER TABLE employees ADD COLUMN last_name TEXT;
ALTER TABLE employees ADD COLUMN first_name TEXT;

-- 2. 既存データ移行（半角スペースで分割）
UPDATE employees SET
  last_name = split_part(name, ' ', 1),
  first_name = CASE
    WHEN position(' ' IN name) > 0 THEN substring(name FROM position(' ' IN name) + 1)
    ELSE ''
  END;

-- 3. NOT NULL 制約
ALTER TABLE employees ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE employees ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE employees ALTER COLUMN first_name SET DEFAULT '';

-- 4. name 自動同期 trigger
CREATE OR REPLACE FUNCTION sync_employee_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_name IS NOT NULL THEN
    NEW.name := TRIM(NEW.last_name || ' ' || COALESCE(NEW.first_name, ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_employee_name
  BEFORE INSERT OR UPDATE OF last_name, first_name ON employees
  FOR EACH ROW EXECUTE FUNCTION sync_employee_name();
