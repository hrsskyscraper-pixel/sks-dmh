-- ========================================
-- テストデータ v2: テスト店舗・テストPJのみ使用
-- アバター: DiceBear イラスト
-- ========================================

-- 1. 前回投入したテストデータを削除
DELETE FROM achievement_history WHERE achievement_id IN (
  SELECT id FROM achievements WHERE employee_id IN (
    SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
  ) OR certified_by IN (
    SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
  )
);
DELETE FROM achievement_comments WHERE achievement_id IN (
  SELECT id FROM achievements WHERE employee_id IN (
    SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
  )
);
DELETE FROM achievement_reactions WHERE achievement_id IN (
  SELECT id FROM achievements WHERE employee_id IN (
    SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
  )
);
DELETE FROM achievements WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
) OR certified_by IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM work_hours WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM career_records WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
) OR created_by IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM goals WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM team_members WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM team_managers WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM team_change_requests WHERE requested_by IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
) OR reviewed_by IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM employee_projects WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL)
);
DELETE FROM project_teams WHERE team_id IN (SELECT id FROM teams WHERE name IN ('新宿店', '渋谷本店'));
DELETE FROM project_teams WHERE project_id IN (SELECT id FROM skill_projects WHERE name LIKE 'テスト_%');
DELETE FROM employees WHERE (name LIKE 'T\_%' ESCAPE '\' OR (name NOT LIKE 't%' AND auth_user_id IS NULL));

-- ========================================
-- 新規テストデータ
-- テスト店舗: 新宿店, 渋谷本店
-- テストPJ: テスト_2026 新卒 早期育成チーム
-- ========================================

-- テスト社員
INSERT INTO employees (id, name, name_kana, email, role, employment_type, hire_date, birth_date, avatar_url, status) VALUES
  -- 新宿店メンバー
  ('22222222-0001-0000-0000-000000000001', 'T_佐藤 美咲', 'さとう みさき', 't_sato@example.test', 'employee', '社員', '2025-04-01', '2002-06-15', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Misaki&backgroundColor=b6e3f4', 'approved'),
  ('22222222-0001-0000-0000-000000000002', 'T_田中 花子', 'たなか はなこ', 't_tanaka@example.test', 'employee', '社員', '2025-04-01', '2002-11-22', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Hanako&backgroundColor=ffd5dc', 'approved'),
  ('22222222-0001-0000-0000-000000000003', 'T_山田 健二', 'やまだ けんじ', 't_yamada@example.test', 'employee', 'メイト', '2025-08-01', '2004-03-10', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Kenji&backgroundColor=c0aede', 'approved'),
  -- 渋谷本店メンバー
  ('22222222-0002-0000-0000-000000000001', 'T_鈴木 太郎', 'すずき たろう', 't_suzuki@example.test', 'employee', '社員', '2026-04-01', '2003-08-25', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Taro&backgroundColor=d1d4f9', 'approved'),
  ('22222222-0002-0000-0000-000000000002', 'T_木村 彩乃', 'きむら あやの', 't_kimura@example.test', 'employee', 'メイト', '2026-01-15', '2005-01-08', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ayano&backgroundColor=ffd5dc', 'approved'),
  -- 新宿店 店長
  ('22222222-0003-0000-0000-000000000001', 'T_藤井 大輔', 'ふじい だいすけ', 't_fujii@example.test', 'store_manager', '社員', '2020-04-01', '1995-04-12', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Daisuke&backgroundColor=b6e3f4', 'approved'),
  -- 渋谷本店 店長
  ('22222222-0003-0000-0000-000000000002', 'T_中村 恵子', 'なかむら けいこ', 't_nakamura@example.test', 'store_manager', '社員', '2019-04-01', '1993-10-20', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Keiko&backgroundColor=ffd5dc', 'approved'),
  -- マネジャー（育成チーム リーダー）
  ('22222222-0004-0000-0000-000000000001', 'T_髙橋 誠', 'たかはし まこと', 't_takahashi@example.test', 'manager', '社員', '2018-04-01', '1990-07-05', 'https://api.dicebear.com/7.x/adventurer/svg?seed=Makoto&backgroundColor=d1d4f9', 'approved');

-- 店舗にメンバー配属
INSERT INTO team_members (team_id, employee_id) VALUES
  ((SELECT id FROM teams WHERE name = '新宿店'), '22222222-0001-0000-0000-000000000001'),
  ((SELECT id FROM teams WHERE name = '新宿店'), '22222222-0001-0000-0000-000000000002'),
  ((SELECT id FROM teams WHERE name = '新宿店'), '22222222-0001-0000-0000-000000000003'),
  ((SELECT id FROM teams WHERE name = '渋谷本店'), '22222222-0002-0000-0000-000000000001'),
  ((SELECT id FROM teams WHERE name = '渋谷本店'), '22222222-0002-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- 店長設定
INSERT INTO team_managers (team_id, employee_id, role) VALUES
  ((SELECT id FROM teams WHERE name = '新宿店'), '22222222-0003-0000-0000-000000000001', 'primary'),
  ((SELECT id FROM teams WHERE name = '渋谷本店'), '22222222-0003-0000-0000-000000000002', 'primary')
ON CONFLICT DO NOTHING;

-- テスト育成チームにメンバー追加
INSERT INTO team_members (team_id, employee_id) VALUES
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '22222222-0001-0000-0000-000000000001'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '22222222-0001-0000-0000-000000000002'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '22222222-0002-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- マネジャーをチームリーダーに
INSERT INTO team_managers (team_id, employee_id, role) VALUES
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '22222222-0004-0000-0000-000000000001', 'primary'),
  ((SELECT id FROM teams WHERE name LIKE 'テスト_2026 新卒%' LIMIT 1), '22222222-0003-0000-0000-000000000001', 'secondary')
ON CONFLICT DO NOTHING;

-- プロジェクトとチームの紐づけ（テストPJのみ）
INSERT INTO project_teams (project_id, team_id)
SELECT sp.id, t.id
FROM skill_projects sp, teams t
WHERE sp.name LIKE 'テスト_2026 新卒%' AND t.name LIKE 'テスト_2026 新卒%'
ON CONFLICT DO NOTHING;

-- 勤務時間（T_佐藤美咲: 2025/4入社、約1400h）
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT '22222222-0001-0000-0000-000000000001', d::date, 8
FROM generate_series('2025-04-01'::date, '2026-03-28'::date, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
LIMIT 175;

-- T_田中花子: 約800h
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT '22222222-0001-0000-0000-000000000002', d::date, 8
FROM generate_series('2025-04-01'::date, '2025-12-31'::date, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
LIMIT 100;

-- キャリア記録
INSERT INTO career_records (employee_id, record_type, occurred_at, department, reason, notes, created_by) VALUES
  -- 入社
  ('22222222-0001-0000-0000-000000000001', '入社', '2025-04-01', NULL, NULL, '2025年新卒入社', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0001-0000-0000-000000000002', '入社', '2025-04-01', NULL, NULL, '2025年新卒入社', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0001-0000-0000-000000000003', '入社', '2025-08-01', NULL, NULL, 'メイト採用', '22222222-0003-0000-0000-000000000001'),
  ('22222222-0002-0000-0000-000000000001', '入社', '2026-04-01', NULL, NULL, '2026年新卒入社', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0002-0000-0000-000000000002', '入社', '2026-01-15', NULL, NULL, 'メイト採用', '22222222-0003-0000-0000-000000000002'),
  ('22222222-0003-0000-0000-000000000001', '入社', '2020-04-01', NULL, NULL, NULL, '22222222-0004-0000-0000-000000000001'),
  ('22222222-0003-0000-0000-000000000002', '入社', '2019-04-01', NULL, NULL, NULL, '22222222-0004-0000-0000-000000000001'),
  ('22222222-0004-0000-0000-000000000001', '入社', '2018-04-01', NULL, NULL, NULL, '22222222-0004-0000-0000-000000000001'),
  -- 配属
  ('22222222-0001-0000-0000-000000000001', '配属・異動', '2025-04-01', '新宿店', NULL, '新卒配属', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0001-0000-0000-000000000002', '配属・異動', '2025-04-01', '新宿店', NULL, '新卒配属', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0002-0000-0000-000000000001', '配属・異動', '2026-04-01', '渋谷本店', NULL, '新卒配属', '22222222-0004-0000-0000-000000000001'),
  -- 役職
  ('22222222-0003-0000-0000-000000000001', '役職', '2023-04-01', '店長', NULL, '新宿店 店長就任', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0003-0000-0000-000000000002', '役職', '2022-10-01', '店長', NULL, '渋谷本店 店長就任', '22222222-0004-0000-0000-000000000001'),
  ('22222222-0004-0000-0000-000000000001', '役職', '2022-04-01', 'エリアマネジャー', NULL, NULL, '22222222-0004-0000-0000-000000000001'),
  -- 資格
  ('22222222-0001-0000-0000-000000000001', '資格', '2025-09-15', '[社内]接客３級', NULL, NULL, '22222222-0003-0000-0000-000000000001'),
  ('22222222-0001-0000-0000-000000000001', '資格', '2026-01-20', '[社内]調理３級', NULL, NULL, '22222222-0003-0000-0000-000000000001'),
  ('22222222-0003-0000-0000-000000000001', '資格', '2021-06-01', '[社内]スター', NULL, NULL, '22222222-0004-0000-0000-000000000001'),
  -- 目標
  ('22222222-0001-0000-0000-000000000001', '目標', '2026-06-30', '接客２級を取得する', 'より高度な接客スキルを習得し、後輩指導もできるようになる', NULL, '22222222-0001-0000-0000-000000000001'),
  ('22222222-0002-0000-0000-000000000001', '目標', '2026-09-30', '接客３級を取得する', '入社半年で基本スキルを身につけ、お客様に信頼される接客を目指す', NULL, '22222222-0002-0000-0000-000000000001');

-- スキル認定（T_佐藤美咲: 60個認定済み）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  '22222222-0001-0000-0000-000000000001',
  s.id,
  'certified',
  ('2025-' || LPAD(LEAST(12, 4 + (row_number() OVER (ORDER BY s.order_index) / 10)::int)::text, 2, '0') || '-' || LPAD(LEAST(28, 1 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  '22222222-0004-0000-0000-000000000001'::uuid,
  ('2025-' || LPAD(LEAST(12, 4 + (row_number() OVER (ORDER BY s.order_index) / 10)::int)::text, 2, '0') || '-' || LPAD(LEAST(28, 2 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  100 + row_number() OVER (ORDER BY s.order_index) * 15
FROM skills s
ORDER BY s.order_index
LIMIT 60;

-- T_田中花子: 30個認定済み
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  '22222222-0001-0000-0000-000000000002',
  s.id,
  'certified',
  ('2025-' || LPAD(LEAST(12, 5 + (row_number() OVER (ORDER BY s.order_index) / 8)::int)::text, 2, '0') || '-' || LPAD(LEAST(28, 1 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  '22222222-0003-0000-0000-000000000001'::uuid,
  ('2025-' || LPAD(LEAST(12, 5 + (row_number() OVER (ORDER BY s.order_index) / 8)::int)::text, 2, '0') || '-' || LPAD(LEAST(28, 3 + (row_number() OVER (ORDER BY s.order_index) % 28))::text, 2, '0'))::timestamptz,
  80 + row_number() OVER (ORDER BY s.order_index) * 20
FROM skills s
ORDER BY s.order_index
LIMIT 30;

-- T_佐藤に差し戻し中のスキル2件（申請中1件）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, certify_comment, apply_comment)
SELECT
  '22222222-0001-0000-0000-000000000001',
  s.id,
  CASE WHEN row_number() OVER (ORDER BY s.order_index) = 1 THEN 'rejected' ELSE 'pending' END,
  now() - interval '3 days',
  CASE WHEN row_number() OVER (ORDER BY s.order_index) = 1 THEN '22222222-0004-0000-0000-000000000001'::uuid ELSE NULL END,
  CASE WHEN row_number() OVER (ORDER BY s.order_index) = 1 THEN now() - interval '1 day' ELSE NULL END,
  CASE WHEN row_number() OVER (ORDER BY s.order_index) = 1 THEN 'もう少し練習してから再申請してください' ELSE NULL END,
  'できるようになりました！'
FROM skills s
WHERE s.id NOT IN (SELECT skill_id FROM achievements WHERE employee_id = '22222222-0001-0000-0000-000000000001')
ORDER BY s.order_index
LIMIT 2;
