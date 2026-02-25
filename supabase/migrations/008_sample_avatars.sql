-- =============================================
-- 008_sample_avatars.sql  サンプル写真を実写に更新
-- =============================================
UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/42.jpg'
  WHERE id = 'a1000000-0000-0000-0000-000000000001'; -- 藤井 大輔

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/55.jpg'
  WHERE id = 'a1000000-0000-0000-0000-000000000002'; -- 高橋 誠

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/women/47.jpg'
  WHERE id = 'b1000000-0000-0000-0000-000000000001'; -- 田中 花子

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/26.jpg'
  WHERE id = 'b1000000-0000-0000-0000-000000000002'; -- 鈴木 太郎

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/women/33.jpg'
  WHERE id = 'b1000000-0000-0000-0000-000000000003'; -- 佐藤 美咲

UPDATE employees SET avatar_url = 'https://randomuser.me/api/portraits/men/61.jpg'
  WHERE id = 'b1000000-0000-0000-0000-000000000004'; -- 山田 健二
