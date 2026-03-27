-- =============================================
-- 009_sample_ahead.sql  標準より先行している社員のサンプル
-- =============================================

-- =============================================
-- 社員追加（先行組）
-- =============================================
INSERT INTO employees (id, auth_user_id, name, email, hire_date, store, role, employment_type, avatar_url) VALUES
  (
    'c1000000-0000-0000-0000-000000000001', NULL,
    '松本 勇太', 'matsumoto@example.test',
    '2025-04-01', '渋谷本店', 'employee', '社員',
    'https://randomuser.me/api/portraits/men/77.jpg'
  ),
  (
    'c1000000-0000-0000-0000-000000000002', NULL,
    '橋本 さくら', 'hashimoto@example.test',
    '2025-10-01', '新宿店', 'employee', '社員',
    'https://randomuser.me/api/portraits/women/22.jpg'
  )
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- 労働時間
-- =============================================

-- 松本 勇太: 2025-04-01〜2025-09-30（約960h）
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT 'c1000000-0000-0000-0000-000000000001'::UUID, d::DATE, 8.0
FROM generate_series('2025-04-01'::DATE, '2025-09-30'::DATE, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
  AND d::DATE NOT IN (
    '2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
    '2025-07-21','2025-08-11','2025-09-15','2025-09-23'
  )
ON CONFLICT DO NOTHING;

-- 橋本 さくら: 2025-10-01〜2026-01-31（約640h）
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT 'c1000000-0000-0000-0000-000000000002'::UUID, d::DATE, 8.0
FROM generate_series('2025-10-01'::DATE, '2026-01-31'::DATE, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
  AND d::DATE NOT IN (
    '2025-10-13','2025-11-03','2025-11-23','2025-11-24',
    '2026-01-01','2026-01-02','2026-01-12','2026-01-13'
  )
ON CONFLICT DO NOTHING;

-- =============================================
-- できました記録 — 松本 勇太（全フェーズ完了・大幅先行）
-- 累積約960h時点で 4月:81件, 5〜6月:26件, 7〜8月:16件 すべて認定
-- 標準 109件 に対し 123件 → +14スキル先行
-- =============================================

-- 4月 certified 81件（全件）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'c1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-04-05'::DATE + (rn / 3) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-04-07'::DATE + (rn / 3) * '1 day'::INTERVAL,
  (rn * 5)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
ON CONFLICT DO NOTHING;

-- 5月〜6月 certified 26件（全件）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'c1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-05-08'::DATE + (rn * 2) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-05-10'::DATE + (rn * 2) * '1 day'::INTERVAL,
  (510 + rn * 10)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
ON CONFLICT DO NOTHING;

-- 7月〜8月 certified 16件（全件）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'c1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-07-10'::DATE + (rn * 4) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-07-12'::DATE + (rn * 4) * '1 day'::INTERVAL,
  (780 + rn * 15)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
ON CONFLICT DO NOTHING;

-- =============================================
-- できました記録 — 橋本 さくら（先行中・入社4ヶ月で大幅前倒し）
-- 累積約640h時点で 4月:81件, 5〜6月:20件, 7〜8月:3件 認定
-- 標準 90件 に対し 104件 → +14スキル先行
-- =============================================

-- 4月 certified 81件（全件）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'c1000000-0000-0000-0000-000000000002',
  s.id, 'certified',
  '2025-10-05'::DATE + (rn / 3) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-10-07'::DATE + (rn / 3) * '1 day'::INTERVAL,
  (rn * 5)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
ON CONFLICT DO NOTHING;

-- 5月〜6月 certified 20件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'c1000000-0000-0000-0000-000000000002',
  s.id, 'certified',
  '2025-11-01'::DATE + (rn * 2) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-11-03'::DATE + (rn * 2) * '1 day'::INTERVAL,
  (510 + rn * 8)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn <= 20
ON CONFLICT DO NOTHING;

-- 7月〜8月 certified 3件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'c1000000-0000-0000-0000-000000000002',
  s.id, 'certified',
  '2025-12-15'::DATE + (rn * 5) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-12-17'::DATE + (rn * 5) * '1 day'::INTERVAL,
  (610 + rn * 10)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn <= 3
ON CONFLICT DO NOTHING;
