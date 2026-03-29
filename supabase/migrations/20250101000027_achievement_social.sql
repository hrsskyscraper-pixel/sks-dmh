-- 認定に対するコメント
CREATE TABLE IF NOT EXISTS achievement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 認定に対するリアクション
CREATE TABLE IF NOT EXISTS achievement_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(achievement_id, employee_id, emoji)
);

-- RLS
ALTER TABLE achievement_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_reactions ENABLE ROW LEVEL SECURITY;

-- 全社員が閲覧可能
CREATE POLICY "comments_select_all" ON achievement_comments FOR SELECT
  USING (EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid()));
CREATE POLICY "reactions_select_all" ON achievement_reactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid()));

-- 自分のコメント・リアクションを作成可能
CREATE POLICY "comments_insert_own" ON achievement_comments FOR INSERT
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid()));
CREATE POLICY "reactions_insert_own" ON achievement_reactions FOR INSERT
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid()));

-- 自分のリアクションを削除可能（取り消し用）
CREATE POLICY "reactions_delete_own" ON achievement_reactions FOR DELETE
  USING (employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid()));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_achievement_comments_achievement ON achievement_comments(achievement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_achievement_reactions_achievement ON achievement_reactions(achievement_id);
CREATE INDEX IF NOT EXISTS idx_achievements_certified_feed ON achievements(certified_at DESC) WHERE status = 'certified';
