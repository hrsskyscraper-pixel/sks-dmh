-- =============================================
-- 016_full_test_data.sql  総合テストデータ
-- =============================================
-- 前提: 013_teams.sql 実行済み（teams/team_members/team_managers テーブル存在）
-- 前提: teams に 渋谷本店・新宿店 が既に存在している

-- =============================================
-- 既存社員にアバター画像を追加
-- =============================================
UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/42.jpg'
WHERE id = 'a1000000-0000-0000-0000-000000000001' AND avatar_url IS NULL;

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/53.jpg'
WHERE id = 'a1000000-0000-0000-0000-000000000002' AND avatar_url IS NULL;

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/women/65.jpg'
WHERE id = 'a1000000-0000-0000-0000-000000000003' AND avatar_url IS NULL;

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/women/32.jpg'
WHERE id = 'b1000000-0000-0000-0000-000000000001' AND avatar_url IS NULL;

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/24.jpg'
WHERE id = 'b1000000-0000-0000-0000-000000000002' AND avatar_url IS NULL;

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/women/18.jpg'
WHERE id = 'b1000000-0000-0000-0000-000000000003' AND avatar_url IS NULL;

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/36.jpg'
WHERE id = 'b1000000-0000-0000-0000-000000000004' AND avatar_url IS NULL;

-- =============================================
-- 木村 彩乃（メイト・標準より遅れ気味）
-- =============================================
INSERT INTO employees (id, auth_user_id, name, email, hire_date, role, employment_type, avatar_url)
VALUES (
  'd1000000-0000-0000-0000-000000000001', NULL,
  '木村 彩乃', 'kimura@example.test',
  '2025-04-01', 'employee', 'メイト',
  'https://randomuser.me/api/portraits/women/44.jpg'
)
ON CONFLICT (email) DO NOTHING;

-- 木村 彩乃: 4h/日（週5、土日祝を除く）2025-04-01〜2026-01-31
-- 合計約 520h（メイト標準完了目安 700h より遅れ）
INSERT INTO work_hours (employee_id, work_date, hours)
SELECT 'd1000000-0000-0000-0000-000000000001'::UUID, d::DATE, 4.0
FROM generate_series('2025-04-01'::DATE, '2026-01-31'::DATE, '1 day') d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
  AND d::DATE NOT IN (
    '2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
    '2025-07-21','2025-08-11',
    '2025-09-15','2025-09-23',
    '2025-10-13','2025-11-03','2025-11-23','2025-11-24',
    '2026-01-01','2026-01-02','2026-01-12','2026-01-13'
  )
ON CONFLICT DO NOTHING;

-- 木村 彩乃: できました記録（4月 certified 22件）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'd1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2025-06-01'::DATE + (rn * 4) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2025-06-03'::DATE + (rn * 4) * '1 day'::INTERVAL,
  (rn * 14)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn <= 22
ON CONFLICT DO NOTHING;

-- 木村 彩乃: 4月 rejected 3件（差し戻し・未読通知）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement, apply_comment, certify_comment, is_read)
SELECT
  'd1000000-0000-0000-0000-000000000001',
  s.id, 'rejected',
  '2026-01-10'::TIMESTAMPTZ + (rn - 22) * '2 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2026-01-12'::TIMESTAMPTZ + (rn - 22) * '2 day'::INTERVAL,
  (420 + (rn - 22) * 10)::NUMERIC,
  'できるようになりました！確認お願いします。',
  CASE rn
    WHEN 23 THEN '基本手順をもう一度確認してください。一人で対応できるようになったら再申請してください。'
    WHEN 24 THEN 'スピードが基準に達していません。練習を続けてから再申請してください。'
    ELSE 'まだ改善の余地があります。マニュアルを見直してから再申請してください。'
  END,
  false
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 23 AND 25
ON CONFLICT DO NOTHING;

-- 木村 彩乃: 4月 pending 5件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, cumulative_hours_at_achievement)
SELECT
  'd1000000-0000-0000-0000-000000000001',
  s.id, 'pending',
  '2026-02-10'::TIMESTAMPTZ + (rn - 25) * '1 day'::INTERVAL,
  (460 + (rn - 25) * 8)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 26 AND 30
ON CONFLICT DO NOTHING;

-- 木村 彩乃: 5月〜6月 certified 8件
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement)
SELECT
  'd1000000-0000-0000-0000-000000000001',
  s.id, 'certified',
  '2026-01-15'::DATE + (rn * 3) * '1 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000001',
  '2026-01-17'::DATE + (rn * 3) * '1 day'::INTERVAL,
  (300 + rn * 16)::NUMERIC
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '5月〜6月') s
WHERE rn <= 8
ON CONFLICT DO NOTHING;

-- =============================================
-- 山田 健二: 差し戻しスキル（未読通知）
-- =============================================
-- 既存: 4月 rn1-38 certified, rn39-58 pending
-- 追加: 4月 rn59-62 rejected（差し戻し・未読）
INSERT INTO achievements (employee_id, skill_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement, apply_comment, certify_comment, is_read)
SELECT
  'b1000000-0000-0000-0000-000000000004',
  s.id, 'rejected',
  '2026-01-20'::TIMESTAMPTZ + (rn - 59) * '2 day'::INTERVAL,
  'a1000000-0000-0000-0000-000000000002',
  '2026-01-22'::TIMESTAMPTZ + (rn - 59) * '2 day'::INTERVAL,
  (1520 + (rn - 59) * 9)::NUMERIC,
  'できるようになりました。確認をお願いします。',
  CASE rn
    WHEN 59 THEN 'まだ一人での対応が難しい場面があります。再度練習してから申請してください。'
    WHEN 60 THEN '手順に抜けがありました。マニュアルを確認して再申請してください。'
    WHEN 61 THEN 'スピードが基準に達していません。もう少し練習を続けてください。'
    ELSE 'まだ改善の余地があります。再確認後に申請してください。'
  END,
  false
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn FROM skills WHERE phase = '4月') s
WHERE rn BETWEEN 59 AND 62
ON CONFLICT DO NOTHING;

-- =============================================
-- 新人育成プロジェクト（横断チーム）を追加
-- =============================================
INSERT INTO teams (id, name, type)
VALUES ('e1000000-0000-0000-0000-000000000001', '新人育成プロジェクト', 'project')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- team_managers（担当マネージャー設定）
-- =============================================

-- 渋谷本店 → 藤井 大輔
INSERT INTO team_managers (team_id, employee_id)
SELECT t.id, 'a1000000-0000-0000-0000-000000000001'
FROM teams t WHERE t.name = '渋谷本店' AND t.type = 'store'
ON CONFLICT DO NOTHING;

-- 新宿店 → 高橋 誠
INSERT INTO team_managers (team_id, employee_id)
SELECT t.id, 'a1000000-0000-0000-0000-000000000002'
FROM teams t WHERE t.name = '新宿店' AND t.type = 'store'
ON CONFLICT DO NOTHING;

-- 新人育成プロジェクト → 藤井 大輔・高橋 誠
INSERT INTO team_managers (team_id, employee_id)
SELECT 'e1000000-0000-0000-0000-000000000001'::UUID, emp_id
FROM (VALUES
  ('a1000000-0000-0000-0000-000000000001'::UUID),
  ('a1000000-0000-0000-0000-000000000002'::UUID)
) t(emp_id)
ON CONFLICT DO NOTHING;

-- =============================================
-- team_members（チームメンバー追加）
-- =============================================

-- 新人育成プロジェクト → 山田 健二・木村 彩乃
INSERT INTO team_members (team_id, employee_id)
SELECT 'e1000000-0000-0000-0000-000000000001'::UUID, emp_id
FROM (VALUES
  ('b1000000-0000-0000-0000-000000000004'::UUID),  -- 山田 健二
  ('d1000000-0000-0000-0000-000000000001'::UUID)   -- 木村 彩乃
) t(emp_id)
ON CONFLICT DO NOTHING;

-- 渋谷本店 → 木村 彩乃
INSERT INTO team_members (team_id, employee_id)
SELECT t.id, 'd1000000-0000-0000-0000-000000000001'
FROM teams t WHERE t.name = '渋谷本店' AND t.type = 'store'
ON CONFLICT DO NOTHING;

-- =============================================
-- team_change_requests（申請データ）
-- =============================================

-- 1. pending: 藤井大輔申請 - 鈴木太郎を新人育成プロジェクトへ追加
--    ops_manager の審査待ち（ダッシュボードの対応待ち件数に反映）
INSERT INTO team_change_requests (id, requested_by, request_type, team_id, payload, status, created_at)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',  -- 藤井 大輔
  'add_member',
  'e1000000-0000-0000-0000-000000000001',  -- 新人育成プロジェクト
  '{"employee_id": "b1000000-0000-0000-0000-000000000002", "manager_id": "a1000000-0000-0000-0000-000000000001"}'::JSONB,
  'pending',
  '2026-02-10 09:00:00+09'
)
ON CONFLICT (id) DO NOTHING;

-- 2. approved（既読）: 高橋誠申請 - 新人育成プロジェクト作成 → 中村恵子が承認済み
INSERT INTO team_change_requests (id, requested_by, request_type, team_id, payload, status, reviewed_by, reviewed_at, review_comment, applicant_read_at, created_at)
VALUES (
  'f1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',  -- 高橋 誠
  'create_team',
  'e1000000-0000-0000-0000-000000000001',  -- 新人育成プロジェクト
  '{"name": "新人育成プロジェクト", "type": "project", "manager_id": "a1000000-0000-0000-0000-000000000002"}'::JSONB,
  'approved',
  'a1000000-0000-0000-0000-000000000003',  -- 中村 恵子
  '2025-12-05 11:30:00+09',
  'プロジェクトの必要性を確認しました。承認します。ぜひ積極的に活用してください。',
  '2025-12-06 09:15:00+09',  -- 既読
  '2025-12-03 10:00:00+09'
)
ON CONFLICT (id) DO NOTHING;

-- 3. rejected（未読）: 藤井大輔申請 - 佐藤美咲を渋谷本店から削除申請 → 中村恵子が差し戻し
--    applicant_read_at = NULL → 藤井大輔のナビバッジに未読として表示される
INSERT INTO team_change_requests (id, requested_by, request_type, team_id, payload, status, reviewed_by, reviewed_at, review_comment, applicant_read_at, created_at)
VALUES (
  'f1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',  -- 藤井 大輔
  'remove_member',
  (SELECT id FROM teams WHERE name = '渋谷本店' AND type = 'store'),
  '{"employee_id": "b1000000-0000-0000-0000-000000000003", "manager_id": "a1000000-0000-0000-0000-000000000001"}'::JSONB,
  'rejected',
  'a1000000-0000-0000-0000-000000000003',  -- 中村 恵子
  '2026-02-12 15:00:00+09',
  '佐藤さんは現在の業務でチームに不可欠です。差し戻しします。理由を添えて改めて申請してください。',
  NULL,  -- 未読（藤井大輔のナビバッジに表示）
  '2026-02-08 14:00:00+09'
)
ON CONFLICT (id) DO NOTHING;
