-- =============================================
-- 068_announcement_welcome_comments.sql
-- お知らせを「タイムライン／本日のお知らせ」共通の投稿として拡張する。
--  - kind に 'welcome'（新メンバー歓迎）を追加
--  - announcement_comments（コメント）を追加（♡＝announcement_reactions と合わせ、タイムライン同様の反応に）
--  - 歓迎投稿は対象者1人につき1件（重複防止）
-- =============================================

ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_kind_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_kind_check CHECK (kind IN ('grade', 'ranking', 'welcome'));

CREATE TABLE IF NOT EXISTS announcement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcement_comments_aid ON announcement_comments (announcement_id, created_at);

ALTER TABLE announcement_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcement_comments_select_all ON announcement_comments FOR SELECT USING (true);
CREATE POLICY announcement_comments_insert_own ON announcement_comments
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));
CREATE POLICY announcement_comments_delete_own ON announcement_comments
  FOR DELETE TO authenticated
  USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

-- 歓迎投稿は対象者1人につき1件（自動投稿が重複しないように）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_announcements_welcome_subject ON announcements (subject_employee_id) WHERE kind = 'welcome';
