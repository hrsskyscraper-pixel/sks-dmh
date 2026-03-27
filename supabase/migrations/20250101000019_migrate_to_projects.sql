-- ============================================================
-- 018_migrate_to_projects.sql
-- 既存データをスキルアッププロジェクト形式に移行
-- ============================================================

-- 固定UUID（参照用）
-- 社員オンボーディング: '11111111-1111-1111-1111-111111111111'
-- メイトオンボーディング: '22222222-2222-2222-2222-222222222222'

-- ============================================================
-- 1. デフォルトプロジェクト2件を挿入
-- ============================================================

INSERT INTO skill_projects (id, name, description, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', '社員オンボーディング', '社員向け入社後スキル習得プログラム', true),
  ('22222222-2222-2222-2222-222222222222', 'メイトオンボーディング', 'メイト向けスキル習得プログラム', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. phase_milestones → project_phases への移行
--    phase_milestonesが存在しない場合はデフォルト値で作成
-- ============================================================

-- 社員オンボーディング フェーズ
INSERT INTO project_phases (project_id, name, order_index, end_hours)
SELECT
  '11111111-1111-1111-1111-111111111111',
  phase,
  CASE phase
    WHEN '4月'     THEN 1
    WHEN '5月〜6月' THEN 2
    WHEN '7月〜8月' THEN 3
    ELSE 99
  END,
  end_hours
FROM phase_milestones
WHERE employment_type = '社員'
ON CONFLICT DO NOTHING;

-- phase_milestonesに社員データがない場合のデフォルト
INSERT INTO project_phases (project_id, name, order_index, end_hours)
SELECT '11111111-1111-1111-1111-111111111111', name, order_index, end_hours
FROM (VALUES
  ('4月',     1, 500),
  ('5月〜6月', 2, 900),
  ('7月〜8月', 3, 1400)
) AS t(name, order_index, end_hours)
WHERE NOT EXISTS (
  SELECT 1 FROM project_phases WHERE project_id = '11111111-1111-1111-1111-111111111111'
);

-- メイトオンボーディング フェーズ
INSERT INTO project_phases (project_id, name, order_index, end_hours)
SELECT
  '22222222-2222-2222-2222-222222222222',
  phase,
  CASE phase
    WHEN '4月'     THEN 1
    WHEN '5月〜6月' THEN 2
    WHEN '7月〜8月' THEN 3
    ELSE 99
  END,
  end_hours
FROM phase_milestones
WHERE employment_type = 'メイト'
ON CONFLICT DO NOTHING;

-- phase_milestonesにメイトデータがない場合のデフォルト
INSERT INTO project_phases (project_id, name, order_index, end_hours)
SELECT '22222222-2222-2222-2222-222222222222', name, order_index, end_hours
FROM (VALUES
  ('4月',     1, 200),
  ('5月〜6月', 2, 400),
  ('7月〜8月', 3, 700)
) AS t(name, order_index, end_hours)
WHERE NOT EXISTS (
  SELECT 1 FROM project_phases WHERE project_id = '22222222-2222-2222-2222-222222222222'
);

-- ============================================================
-- 3. 全スキルを両プロジェクトの project_skills に紐づけ
--    skills.phase → project_phase_id をマッピング
-- ============================================================

-- 社員オンボーディング用
INSERT INTO project_skills (project_id, skill_id, project_phase_id)
SELECT
  '11111111-1111-1111-1111-111111111111',
  s.id,
  pp.id
FROM skills s
LEFT JOIN project_phases pp
  ON pp.project_id = '11111111-1111-1111-1111-111111111111'
  AND pp.name = s.phase
ON CONFLICT (project_id, skill_id) DO NOTHING;

-- メイトオンボーディング用
INSERT INTO project_skills (project_id, skill_id, project_phase_id)
SELECT
  '22222222-2222-2222-2222-222222222222',
  s.id,
  pp.id
FROM skills s
LEFT JOIN project_phases pp
  ON pp.project_id = '22222222-2222-2222-2222-222222222222'
  AND pp.name = s.phase
ON CONFLICT (project_id, skill_id) DO NOTHING;

-- ============================================================
-- 4. employees.employment_type に基づき employee_projects に登録
-- ============================================================

INSERT INTO employee_projects (employee_id, project_id, joined_at)
SELECT
  e.id,
  '11111111-1111-1111-1111-111111111111',
  COALESCE(e.hire_date::timestamptz, now())
FROM employees e
WHERE e.employment_type = '社員'
ON CONFLICT (employee_id, project_id) DO NOTHING;

INSERT INTO employee_projects (employee_id, project_id, joined_at)
SELECT
  e.id,
  '22222222-2222-2222-2222-222222222222',
  COALESCE(e.hire_date::timestamptz, now())
FROM employees e
WHERE e.employment_type = 'メイト'
ON CONFLICT (employee_id, project_id) DO NOTHING;

-- ============================================================
-- 5. skills.phase の CHECK 制約を緩和（NULL許容化）
-- ============================================================

-- 既存のCHECK制約を削除
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_phase_check;

-- phase を NULL 許容に変更（既存データは保持）
ALTER TABLE skills ALTER COLUMN phase DROP NOT NULL;
