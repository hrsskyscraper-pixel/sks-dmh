-- '新卒' → '社員' に名称変更
-- 注意: 旧 CHECK 制約が残ったまま UPDATE すると違反になるため、
--       「制約を外す → 値を書き換える → 新制約を付ける」の順で行う（2026-09-19 ステージング構築時に順序を修正）
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employment_type_check;
ALTER TABLE phase_milestones DROP CONSTRAINT IF EXISTS phase_milestones_employment_type_check;

UPDATE employees SET employment_type = '社員' WHERE employment_type = '新卒';
UPDATE phase_milestones SET employment_type = '社員' WHERE employment_type = '新卒';

-- CHECK 制約を更新
ALTER TABLE employees ADD CONSTRAINT employees_employment_type_check
  CHECK (employment_type IN ('社員', 'メイト'));
ALTER TABLE phase_milestones ADD CONSTRAINT phase_milestones_employment_type_check
  CHECK (employment_type IN ('社員', 'メイト'));

-- 列の既定値も '新卒' のままだと、以後のサンプル投入や既定値依存の INSERT が新制約に違反するため合わせて変更
ALTER TABLE employees ALTER COLUMN employment_type SET DEFAULT '社員';
ALTER TABLE phase_milestones ALTER COLUMN employment_type SET DEFAULT '社員';
