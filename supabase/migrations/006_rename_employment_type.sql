-- '新卒' → '社員' に名称変更
UPDATE employees SET employment_type = '社員' WHERE employment_type = '新卒';
UPDATE phase_milestones SET employment_type = '社員' WHERE employment_type = '新卒';

-- CHECK 制約を更新
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employment_type_check;
ALTER TABLE employees ADD CONSTRAINT employees_employment_type_check
  CHECK (employment_type IN ('社員', 'メイト'));

ALTER TABLE phase_milestones DROP CONSTRAINT IF EXISTS phase_milestones_employment_type_check;
ALTER TABLE phase_milestones ADD CONSTRAINT phase_milestones_employment_type_check
  CHECK (employment_type IN ('社員', 'メイト'));
