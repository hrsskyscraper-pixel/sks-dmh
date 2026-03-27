-- =============================================
-- 003_test_data.sql  開発用テストデータ
-- =============================================

-- 現在ログイン中のユーザーを admin に昇格 & 店舗設定
UPDATE employees
SET role = 'admin', store = '渋谷本店'
WHERE auth_user_id IS NOT NULL;

-- =============================================
-- 先輩社員（マネージャー）
-- =============================================
INSERT INTO employees (id, auth_user_id, name, email, hire_date, store, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', NULL, '藤井 大輔', 'fujii@example.test',     '2020-04-01', '渋谷本店', 'manager'),
  ('a1000000-0000-0000-0000-000000000002', NULL, '高橋 誠',   'takahashi@example.test', '2018-04-01', '新宿店',   'manager')
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- 新卒社員（2025年4月入社）
-- =============================================
INSERT INTO employees (id, auth_user_id, name, email, hire_date, store, role) VALUES
  ('b1000000-0000-0000-0000-000000000001', NULL, '田中 花子', 'tanaka@example.test', '2025-04-01', '渋谷本店', 'employee'),
  ('b1000000-0000-0000-0000-000000000002', NULL, '鈴木 太郎', 'suzuki@example.test', '2025-04-01', '新宿店',   'employee'),
  ('b1000000-0000-0000-0000-000000000003', NULL, '佐藤 美咲', 'sato@example.test',   '2025-04-01', '渋谷本店', 'employee'),
  ('b1000000-0000-0000-0000-000000000004', NULL, '山田 健二', 'yamada@example.test', '2025-04-01', '新宿店',   'employee')
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- 労働時間（2025-04-01〜2026-01-31 土日祝除く 8h/日）
-- =============================================
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT emp_id, d::DATE, 8.0
FROM (VALUES
  ('b1000000-0000-0000-0000-000000000001'::UUID),
  ('b1000000-0000-0000-0000-000000000002'::UUID),
  ('b1000000-0000-0000-0000-000000000003'::UUID),
  ('b1000000-0000-0000-0000-000000000004'::UUID)
) t(emp_id),
generate_series('2025-04-01'::DATE, '2026-01-31'::DATE, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
  AND d::DATE NOT IN (
    '2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
    '2025-07-21','2025-08-11',
    '2025-09-15','2025-09-23',
    '2025-10-13','2025-11-03','2025-11-23','2025-11-24',
    '2026-01-01','2026-01-02','2026-01-12','2026-01-13'
  )
ON CONFLICT DO NOTHING;

-- =============================================
-- できました記録
-- =============================================
-- 凡例:
--   certified = 認定済み（先輩が確認）
--   pending   = 申請中（本人申告、未認定）
--
--   田中 花子: 優秀（4月:68cert/8pend, 5〜6月:18cert/5pend, 7〜8月:7cert/4pend）
--   佐藤 美咲: トップ（4月:78cert/3pend, 5〜6月:22cert/4pend, 7〜8月:10cert/4pend）
--   鈴木 太郎: 平均（4月:50cert/16pend, 5〜6月:10cert/8pend, 7〜8月:2cert/3pend）
--   山田 健二: 苦戦（4月:38cert/20pend, 5〜6月:6cert/8pend, 7〜8月:0cert/2pend）
-- =============================================


-- ─────────────────────────────────────────────
-- 田中 花子
-- ─────────────────────────────────────────────

-- 4月 certified 68件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-04-10'::DATE + (rn / 2) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-04-12'::DATE + (rn / 2) * '1 day'::INTERVAL,
  (rn * 7)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn <= 68
ON CONFLICT DO NOTHING;

-- 4月 pending 8件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  s.id, 'pending',
  '2025-11-01'::TIMESTAMPTZ + (rn - 68) * '1 day'::INTERVAL,
  NULL, NULL,
  (1400 + (rn - 68) * 8)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 69 AND 76
ON CONFLICT DO NOTHING;

-- 5月〜6月 certified 18件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-05-15'::DATE + (rn * 3) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-05-17'::DATE + (rn * 3) * '1 day'::INTERVAL,
  (600 + rn * 15)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn <= 18
ON CONFLICT DO NOTHING;

-- 5月〜6月 pending 5件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  s.id, 'pending',
  '2025-11-10'::TIMESTAMPTZ + (rn - 18) * '1 day'::INTERVAL,
  NULL, NULL,
  (1200 + (rn - 18) * 12)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn BETWEEN 19 AND 23
ON CONFLICT DO NOTHING;

-- 7月〜8月 certified 7件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-07-15'::DATE + (rn * 5) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-07-17'::DATE + (rn * 5) * '1 day'::INTERVAL,
  (1000 + rn * 20)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn <= 7
ON CONFLICT DO NOTHING;

-- 7月〜8月 pending 4件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000001',
  s.id, 'pending',
  '2026-01-05'::TIMESTAMPTZ + (rn - 7) * '1 day'::INTERVAL,
  NULL, NULL,
  (1500 + (rn - 7) * 15)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn BETWEEN 8 AND 11
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────
-- 佐藤 美咲（トップパフォーマー）
-- ─────────────────────────────────────────────

-- 4月 certified 78件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  s.id, 'certified',
  '2025-04-05'::DATE + (rn / 2) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-04-07'::DATE + (rn / 2) * '1 day'::INTERVAL,
  (rn * 6)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn <= 78
ON CONFLICT DO NOTHING;

-- 4月 pending 3件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  s.id, 'pending',
  '2025-10-15'::TIMESTAMPTZ + (rn - 78) * '1 day'::INTERVAL,
  NULL, NULL,
  (1300 + (rn - 78) * 8)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 79 AND 81
ON CONFLICT DO NOTHING;

-- 5月〜6月 certified 22件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  s.id, 'certified',
  '2025-05-10'::DATE + (rn * 2) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-05-12'::DATE + (rn * 2) * '1 day'::INTERVAL,
  (550 + rn * 12)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn <= 22
ON CONFLICT DO NOTHING;

-- 5月〜6月 pending 4件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  s.id, 'pending',
  '2025-10-20'::TIMESTAMPTZ + (rn - 22) * '1 day'::INTERVAL,
  NULL, NULL,
  (1100 + (rn - 22) * 10)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn BETWEEN 23 AND 26
ON CONFLICT DO NOTHING;

-- 7月〜8月 certified 10件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  s.id, 'certified',
  '2025-07-10'::DATE + (rn * 4) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-07-12'::DATE + (rn * 4) * '1 day'::INTERVAL,
  (950 + rn * 18)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn <= 10
ON CONFLICT DO NOTHING;

-- 7月〜8月 pending 4件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000003',
  s.id, 'pending',
  '2025-12-01'::TIMESTAMPTZ + (rn - 10) * '1 day'::INTERVAL,
  NULL, NULL,
  (1400 + (rn - 10) * 12)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn BETWEEN 11 AND 14
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────
-- 鈴木 太郎（平均的）
-- ─────────────────────────────────────────────

-- 4月 certified 50件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  s.id, 'certified',
  '2025-04-15'::DATE + rn * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-04-17'::DATE + rn * '1 day'::INTERVAL,
  (rn * 9)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn <= 50
ON CONFLICT DO NOTHING;

-- 4月 pending 16件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  s.id, 'pending',
  '2025-11-20'::TIMESTAMPTZ + (rn - 50) * '1 day'::INTERVAL,
  NULL, NULL,
  (1450 + (rn - 50) * 9)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 51 AND 66
ON CONFLICT DO NOTHING;

-- 5月〜6月 certified 10件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  s.id, 'certified',
  '2025-06-01'::DATE + (rn * 4) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-06-03'::DATE + (rn * 4) * '1 day'::INTERVAL,
  (700 + rn * 16)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn <= 10
ON CONFLICT DO NOTHING;

-- 5月〜6月 pending 8件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  s.id, 'pending',
  '2025-12-01'::TIMESTAMPTZ + (rn - 10) * '1 day'::INTERVAL,
  NULL, NULL,
  (1300 + (rn - 10) * 10)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn BETWEEN 11 AND 18
ON CONFLICT DO NOTHING;

-- 7月〜8月 certified 2件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  s.id, 'certified',
  '2025-08-01'::DATE + (rn * 7) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-08-03'::DATE + (rn * 7) * '1 day'::INTERVAL,
  (1100 + rn * 22)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn <= 2
ON CONFLICT DO NOTHING;

-- 7月〜8月 pending 3件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000002',
  s.id, 'pending',
  '2026-01-15'::TIMESTAMPTZ + (rn - 2) * '1 day'::INTERVAL,
  NULL, NULL,
  (1500 + (rn - 2) * 10)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn BETWEEN 3 AND 5
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────
-- 山田 健二（苦戦中）
-- ─────────────────────────────────────────────

-- 4月 certified 38件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000004',
  s.id, 'certified',
  '2025-04-20'::DATE + rn * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-04-22'::DATE + rn * '1 day'::INTERVAL,
  (rn * 11)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn <= 38
ON CONFLICT DO NOTHING;

-- 4月 pending 20件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000004',
  s.id, 'pending',
  '2025-12-01'::TIMESTAMPTZ + (rn - 38) * '1 day'::INTERVAL,
  NULL, NULL,
  (1500 + (rn - 38) * 9)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 39 AND 58
ON CONFLICT DO NOTHING;

-- 5月〜6月 certified 6件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000004',
  s.id, 'certified',
  '2025-06-15'::DATE + (rn * 5) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2025-06-17'::DATE + (rn * 5) * '1 day'::INTERVAL,
  (800 + rn * 18)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn <= 6
ON CONFLICT DO NOTHING;

-- 5月〜6月 pending 8件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000004',
  s.id, 'pending',
  '2026-01-01'::TIMESTAMPTZ + (rn - 6) * '1 day'::INTERVAL,
  NULL, NULL,
  (1400 + (rn - 6) * 10)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn BETWEEN 7 AND 14
ON CONFLICT DO NOTHING;

-- 7月〜8月 pending 2件（certified なし）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'b1000000-0000-0000-0000-000000000004',
  s.id, 'pending',
  '2026-02-01'::TIMESTAMPTZ + rn * '1 day'::INTERVAL,
  NULL, NULL,
  (1500 + rn * 8)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '7月〜8月') s
WHERE rn <= 2
ON CONFLICT DO NOTHING;
