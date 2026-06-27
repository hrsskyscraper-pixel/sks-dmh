-- =============================================
-- 067_announcements.sql
-- 「本日のお知らせ」: 級合格の祝い投稿 ＋ 月次スキル習得数ランキングの掲載。
-- みんなが「🎉おめでとう」を送れる。表示期限つき（級合格は7日）。
-- =============================================

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('grade', 'ranking')),
  subject_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,  -- 級合格の対象者
  grade_label TEXT,                                                      -- 級合格の内容（例: 接客3級）
  title TEXT,                                                            -- ランキング見出し等
  body TEXT,                                                             -- ランキング本文（TOP3 等）
  period TEXT,                                                           -- ランキング対象月 'YYYY-MM'（重複生成防止）
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,           -- 投稿者（ランキングは NULL=システム）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements (created_at DESC);
-- ランキングは対象月ごとに1件だけ（読込時の自動生成が重複しないように）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_announcements_ranking_period ON announcements (period) WHERE kind = 'ranking';

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '🎉',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, employee_id, emoji)
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reactions ENABLE ROW LEVEL SECURITY;

-- 閲覧は全員可。
CREATE POLICY announcements_select_all ON announcements FOR SELECT USING (true);
CREATE POLICY announcement_reactions_select_all ON announcement_reactions FOR SELECT USING (true);

-- 投稿・月次生成は service-role(admin client) 経由＋サーバーで権限確認するため、
-- authenticated の直接 INSERT ポリシーは作らない（RLS で既定拒否）。
-- リアクションは本人がブラウザから付け外しできる。
CREATE POLICY announcement_reactions_insert_own ON announcement_reactions
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));
CREATE POLICY announcement_reactions_delete_own ON announcement_reactions
  FOR DELETE TO authenticated
  USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));
