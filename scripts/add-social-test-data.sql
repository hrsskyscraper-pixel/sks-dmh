-- ========================================
-- テストデータ: リアクション・コメント追加
-- みんなの成長 / タイムライン 用
-- ========================================

-- 既存のテストリアクション・コメントを削除
DELETE FROM achievement_reactions WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\'
);
DELETE FROM achievement_comments WHERE employee_id IN (
  SELECT id FROM employees WHERE name LIKE 'T\_%' ESCAPE '\'
);

-- T_佐藤美咲の認定済みスキルに対するリアクション
-- 最新10件の認定済みachievementにリアクションを追加
WITH recent_certified AS (
  SELECT id, employee_id
  FROM achievements
  WHERE employee_id = '22222222-0001-0000-0000-000000000001'
    AND status = 'certified'
  ORDER BY certified_at DESC
  LIMIT 10
)
INSERT INTO achievement_reactions (achievement_id, employee_id, emoji)
SELECT rc.id, reactor.id, '❤️'
FROM recent_certified rc
CROSS JOIN (
  VALUES
    ('22222222-0001-0000-0000-000000000002'), -- T_田中花子
    ('22222222-0003-0000-0000-000000000001'), -- T_藤井大輔
    ('22222222-0004-0000-0000-000000000001')  -- T_髙橋誠
) AS reactor(id)
WHERE random() > 0.3  -- ランダムに70%程度のリアクション
ON CONFLICT DO NOTHING;

-- T_田中花子の認定済みスキルに対するリアクション
WITH recent_certified AS (
  SELECT id, employee_id
  FROM achievements
  WHERE employee_id = '22222222-0001-0000-0000-000000000002'
    AND status = 'certified'
  ORDER BY certified_at DESC
  LIMIT 8
)
INSERT INTO achievement_reactions (achievement_id, employee_id, emoji)
SELECT rc.id, reactor.id, '❤️'
FROM recent_certified rc
CROSS JOIN (
  VALUES
    ('22222222-0001-0000-0000-000000000001'), -- T_佐藤美咲
    ('22222222-0003-0000-0000-000000000001'), -- T_藤井大輔
    ('22222222-0001-0000-0000-000000000003')  -- T_山田健二
) AS reactor(id)
WHERE random() > 0.4
ON CONFLICT DO NOTHING;

-- コメント追加（最新の認定済みachievementに）
-- T_佐藤美咲のachievementへのコメント
WITH target_ach AS (
  SELECT id, certified_at
  FROM achievements
  WHERE employee_id = '22222222-0001-0000-0000-000000000001'
    AND status = 'certified'
  ORDER BY certified_at DESC
  LIMIT 5
)
INSERT INTO achievement_comments (achievement_id, employee_id, content, created_at) VALUES
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 0),
   '22222222-0003-0000-0000-000000000001',
   'すごい！どんどん成長してるね！', now() - interval '2 days'),
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 0),
   '22222222-0004-0000-0000-000000000001',
   '順調に進んでいますね。この調子で頑張りましょう！', now() - interval '1 day'),
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 1),
   '22222222-0001-0000-0000-000000000002',
   '私も頑張らなきゃ！刺激になります✨', now() - interval '3 days'),
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 2),
   '22222222-0003-0000-0000-000000000001',
   'お客様対応もばっちりだったよ👍', now() - interval '5 days'),
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 3),
   '22222222-0001-0000-0000-000000000003',
   '佐藤さん、教えてもらったおかげです！', now() - interval '7 days');

-- T_田中花子のachievementへのコメント
WITH target_ach AS (
  SELECT id, certified_at
  FROM achievements
  WHERE employee_id = '22222222-0001-0000-0000-000000000002'
    AND status = 'certified'
  ORDER BY certified_at DESC
  LIMIT 3
)
INSERT INTO achievement_comments (achievement_id, employee_id, content, created_at) VALUES
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 0),
   '22222222-0001-0000-0000-000000000001',
   'おめでとう！一緒に頑張ろうね！', now() - interval '4 days'),
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 1),
   '22222222-0003-0000-0000-000000000001',
   '着実にステップアップしてるね。素晴らしい！', now() - interval '6 days'),
  ((SELECT id FROM target_ach ORDER BY certified_at DESC LIMIT 1 OFFSET 2),
   '22222222-0004-0000-0000-000000000001',
   '次のフェーズも期待しています。', now() - interval '10 days');
