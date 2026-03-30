-- 店舗に都道府県を追加
ALTER TABLE teams ADD COLUMN prefecture TEXT;

-- 既存店舗に都道府県を設定
UPDATE teams SET prefecture = '群馬県' WHERE name IN ('太田末広店','太田西矢島店','群馬大間々店','館林国道122号店','藤岡北ノ原店','前橋日吉店');
UPDATE teams SET prefecture = '新潟県' WHERE name IN ('新潟新通り店','イエローハットシティー長岡店','三条燕インター店','新潟亀田店');
UPDATE teams SET prefecture = '東京都' WHERE name IN ('JR秋葉原駅昭和通り口店','JR大森駅東口店','足立区佐野店','御徒町昭和通り店','五反田山手通り店','東急戸越銀座駅前店','ラーメン大戦争 神田店','ラーメン大戦争 水道橋店','新宿店');
UPDATE teams SET prefecture = '神奈川県' WHERE name IN ('東急白楽駅前通店','緑区中山店');
UPDATE teams SET prefecture = '茨城県' WHERE name IN ('つくば桜店');
UPDATE teams SET prefecture = '千葉県' WHERE name IN ('ミスターマックス新習志野店');
UPDATE teams SET prefecture = '埼玉県' WHERE name IN ('JR浦和駅西口店','春日部新方袋店','熊谷駅店');
UPDATE teams SET prefecture = '栃木県' WHERE name IN ('佐野国道50号店');
UPDATE teams SET prefecture = '静岡県' WHERE name IN ('静岡富士宮バイパス店','富士高島町店');
UPDATE teams SET prefecture = '秋田県' WHERE name IN ('ラウンドワン秋田店','秋田東通店','秋田土崎店');
UPDATE teams SET prefecture = '東京都' WHERE name = '渋谷本店';
