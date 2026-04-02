-- ========================================
-- テストデータリセット & 新規投入
-- ========================================

-- 1. テストアカウント(t始まり + CoCo)のIDリスト
-- 削除順序: 外部キー制約を考慮

-- achievement_history 削除
DELETE FROM achievement_history WHERE achievement_id IN (
  SELECT id FROM achievements WHERE employee_id IN (
    SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
  )
);

-- achievement_comments 削除
DELETE FROM achievement_comments WHERE achievement_id IN (
  SELECT id FROM achievements WHERE employee_id IN (
    SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
  )
);

-- achievement_reactions 削除
DELETE FROM achievement_reactions WHERE achievement_id IN (
  SELECT id FROM achievements WHERE employee_id IN (
    SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
  )
);

-- achievements 削除
DELETE FROM achievements WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
) OR certified_by IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- work_hours 削除
DELETE FROM work_hours WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- career_records 削除
DELETE FROM career_records WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
) OR created_by IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- goals 削除
DELETE FROM goals WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- team_members 削除
DELETE FROM team_members WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- team_managers 削除
DELETE FROM team_managers WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- team_change_requests 削除（requested_by OR reviewed_by）
DELETE FROM team_change_requests WHERE requested_by IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
) OR reviewed_by IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- employee_projects 削除
DELETE FROM employee_projects WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 't%' OR name LIKE 'CoCo%'
);

-- project_teams 削除（全削除して再投入）
DELETE FROM project_teams;

-- employees 削除（auth_user_idがNULLのもの = 実際のログインユーザーでないテストデータ）
DELETE FROM employees WHERE (name LIKE 't%' OR name LIKE 'CoCo%') AND auth_user_id IS NULL;

-- ========================================
-- 新規テストデータ投入
-- ========================================

-- テスト社員（auth_user_idなし = ログインできないダミー）
INSERT INTO employees (id, name, name_kana, email, role, employment_type, hire_date, birth_date, status) VALUES
  -- 社員（新卒2026年入社）
  ('11111111-aaaa-0001-0000-000000000001', '新田 悠斗', 'にった ゆうと', 'nitta@example.test', 'employee', '社員', '2026-04-01', '2003-08-15', 'approved'),
  ('11111111-aaaa-0001-0000-000000000002', '小林 美月', 'こばやし みづき', 'kobayashi.m@example.test', 'employee', '社員', '2026-04-01', '2003-11-22', 'approved'),
  ('11111111-aaaa-0001-0000-000000000003', '渡辺 蒼', 'わたなべ あおい', 'watanabe.a@example.test', 'employee', '社員', '2026-04-01', '2004-02-10', 'approved'),
  -- 社員（2025年入社）
  ('11111111-aaaa-0002-0000-000000000001', '加藤 陽菜', 'かとう ひな', 'kato.h@example.test', 'employee', '社員', '2025-04-01', '2002-06-30', 'approved'),
  ('11111111-aaaa-0002-0000-000000000002', '伊藤 大翔', 'いとう ひろと', 'ito.h@example.test', 'employee', '社員', '2025-04-01', '2002-09-18', 'approved'),
  -- メイト
  ('11111111-aaaa-0003-0000-000000000001', '高田 真央', 'たかだ まお', 'takada.m@example.test', 'employee', 'メイト', '2025-06-01', '2005-03-25', 'approved'),
  ('11111111-aaaa-0003-0000-000000000002', '松本 結衣', 'まつもと ゆい', 'matsumoto.y@example.test', 'employee', 'メイト', '2025-08-01', '2004-12-05', 'approved'),
  ('11111111-aaaa-0003-0000-000000000003', '石井 翔太', 'いしい しょうた', 'ishii.s@example.test', 'employee', 'メイト', '2026-01-15', '2005-07-20', 'approved'),
  -- 店長
  ('11111111-aaaa-0004-0000-000000000001', '山本 健太', 'やまもと けんた', 'yamamoto.k@example.test', 'store_manager', '社員', '2020-04-01', '1995-04-12', 'approved'),
  ('11111111-aaaa-0004-0000-000000000002', '吉田 麻衣', 'よしだ まい', 'yoshida.m@example.test', 'store_manager', '社員', '2019-04-01', '1993-10-08', 'approved'),
  -- マネジャー
  ('11111111-aaaa-0005-0000-000000000001', '鈴木 一郎', 'すずき いちろう', 'suzuki.i@example.test', 'manager', '社員', '2018-04-01', '1990-01-15', 'approved');

-- チームメンバー設定
-- JR秋葉原駅昭和通り口店のID取得用（既存店舗を使用）
-- 太田末広店、前橋日吉店 なども使用

-- 2026新卒育成チーム（既存）にメンバー追加
INSERT INTO team_members (team_id, employee_id) VALUES
  -- テスト_2026 新卒 早期育成チーム
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '11111111-aaaa-0001-0000-000000000001'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '11111111-aaaa-0001-0000-000000000002'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '11111111-aaaa-0001-0000-000000000003'),
  -- テスト_2026 メイト 早期育成チーム
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 メイト%' LIMIT 1), '11111111-aaaa-0003-0000-000000000001'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 メイト%' LIMIT 1), '11111111-aaaa-0003-0000-000000000002'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 メイト%' LIMIT 1), '11111111-aaaa-0003-0000-000000000003')
ON CONFLICT DO NOTHING;

-- 店舗にメンバー配属
INSERT INTO team_members (team_id, employee_id) VALUES
  ((SELECT id FROM teams WHERE name = 'JR秋葉原駅昭和通り口店'), '11111111-aaaa-0001-0000-000000000001'),
  ((SELECT id FROM teams WHERE name = 'JR秋葉原駅昭和通り口店'), '11111111-aaaa-0003-0000-000000000001'),
  ((SELECT id FROM teams WHERE name = '太田末広店'), '11111111-aaaa-0001-0000-000000000002'),
  ((SELECT id FROM teams WHERE name = '太田末広店'), '11111111-aaaa-0003-0000-000000000002'),
  ((SELECT id FROM teams WHERE name = '前橋日吉店'), '11111111-aaaa-0001-0000-000000000003'),
  ((SELECT id FROM teams WHERE name = '前橋日吉店'), '11111111-aaaa-0003-0000-000000000003'),
  ((SELECT id FROM teams WHERE name = 'JR秋葉原駅昭和通り口店'), '11111111-aaaa-0002-0000-000000000001'),
  ((SELECT id FROM teams WHERE name = '太田末広店'), '11111111-aaaa-0002-0000-000000000002')
ON CONFLICT DO NOTHING;

-- 店長をチームマネージャーに
INSERT INTO team_managers (team_id, employee_id, role) VALUES
  ((SELECT id FROM teams WHERE name = 'JR秋葉原駅昭和通り口店'), '11111111-aaaa-0004-0000-000000000001', 'primary'),
  ((SELECT id FROM teams WHERE name = '太田末広店'), '11111111-aaaa-0004-0000-000000000002', 'primary'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '11111111-aaaa-0005-0000-000000000001', 'primary'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 メイト%' LIMIT 1), '11111111-aaaa-0005-0000-000000000001', 'secondary'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '11111111-aaaa-0004-0000-000000000001', 'secondary')
ON CONFLICT DO NOTHING;

-- プロジェクトとチームの紐づけ
INSERT INTO project_teams (project_id, team_id) VALUES
  ((SELECT id FROM skill_projects WHERE name LIKE '店舗新人%' LIMIT 1), (SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1)),
  ((SELECT id FROM skill_projects WHERE name LIKE '店舗新人%' LIMIT 1), (SELECT id FROM teams WHERE name LIKE 'テスト_2026 メイト%' LIMIT 1))
ON CONFLICT DO NOTHING;

-- 勤務時間データ（8h/日 × 20日/月 = 160h で生成）
-- 加藤陽菜（2025入社、約1400h）
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT '11111111-aaaa-0002-0000-000000000001', d::date, 8
FROM generate_series('2025-04-01'::date, '2026-03-20'::date, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)  -- 土日除外
LIMIT 175;

-- 伊藤大翔（2025入社、約800h）
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT '11111111-aaaa-0002-0000-000000000002', d::date, 8
FROM generate_series('2025-04-01'::date, '2025-12-31'::date, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
LIMIT 100;

-- キャリア記録
INSERT INTO career_records (employee_id, record_type, occurred_at, department, reason, notes, created_by) VALUES
  -- 入社記録
  ('11111111-aaaa-0001-0000-000000000001', '入社', '2026-04-01', NULL, NULL, '2026年新卒入社', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0001-0000-000000000002', '入社', '2026-04-01', NULL, NULL, '2026年新卒入社', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0001-0000-000000000003', '入社', '2026-04-01', NULL, NULL, '2026年新卒入社', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0002-0000-000000000001', '入社', '2025-04-01', NULL, NULL, '2025年新卒入社', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0002-0000-000000000002', '入社', '2025-04-01', NULL, NULL, '2025年新卒入社', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0004-0000-000000000001', '入社', '2020-04-01', NULL, NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0004-0000-000000000002', '入社', '2019-04-01', NULL, NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0005-0000-000000000001', '入社', '2018-04-01', NULL, NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  -- 配属・異動
  ('11111111-aaaa-0001-0000-000000000001', '配属・異動', '2026-04-01', 'JR秋葉原駅昭和通り口店', NULL, '新卒配属', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0001-0000-000000000002', '配属・異動', '2026-04-01', '太田末広店', NULL, '新卒配属', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0001-0000-000000000003', '配属・異動', '2026-04-01', '前橋日吉店', NULL, '新卒配属', '11111111-aaaa-0005-0000-000000000001'),
  -- 役職
  ('11111111-aaaa-0004-0000-000000000001', '役職', '2023-04-01', '店長', NULL, 'JR秋葉原駅昭和通り口店 店長就任', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0004-0000-000000000002', '役職', '2022-10-01', '店長', NULL, '太田末広店 店長就任', '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0005-0000-000000000001', '役職', '2022-04-01', 'エリアマネジャー', NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  -- 資格
  ('11111111-aaaa-0002-0000-000000000001', '資格', '2025-09-15', '[社内]接客３級', NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0002-0000-000000000001', '資格', '2026-01-20', '[社内]調理３級', NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  ('11111111-aaaa-0004-0000-000000000001', '資格', '2021-06-01', '[社内]スター', NULL, NULL, '11111111-aaaa-0005-0000-000000000001'),
  -- 目標
  ('11111111-aaaa-0001-0000-000000000001', '目標', '2026-06-30', '接客３級を取得する', '入社3ヶ月で基本スキルを身につけ、お客様に信頼される接客を目指す', NULL, '11111111-aaaa-0001-0000-000000000001'),
  ('11111111-aaaa-0002-0000-000000000001', '目標', '2026-06-30', '接客２級を取得する', 'より高度な接客スキルを習得し、後輩の指導もできるようになる', NULL, '11111111-aaaa-0002-0000-000000000001');

-- スキル認定データ（加藤陽菜: 2025年入社、60個認定済み）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  '11111111-aaaa-0002-0000-000000000001',
  s.id,
  'certified',
  ('2025-' || LPAD((4 + (row_number() OVER (ORDER BY s.order_index) / 10)::int)::text, 2, '0') || '-' || LPAD((1 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  '11111111-aaaa-0005-0000-000000000001'::uuid,
  ('2025-' || LPAD((4 + (row_number() OVER (ORDER BY s.order_index) / 10)::int)::text, 2, '0') || '-' || LPAD((2 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  100 + row_number() OVER (ORDER BY s.order_index) * 15
FROM skills s
ORDER BY s.order_index
LIMIT 60;

-- 伊藤大翔: 30個認定済み
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  '11111111-aaaa-0002-0000-000000000002',
  s.id,
  'certified',
  ('2025-' || LPAD((5 + (row_number() OVER (ORDER BY s.order_index) / 8)::int)::text, 2, '0') || '-' || LPAD((1 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  '11111111-aaaa-0004-0000-000000000002'::uuid,
  ('2025-' || LPAD((5 + (row_number() OVER (ORDER BY s.order_index) / 8)::int)::text, 2, '0') || '-' || LPAD((3 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  80 + row_number() OVER (ORDER BY s.order_index) * 20
FROM skills s
ORDER BY s.order_index
LIMIT 30;
