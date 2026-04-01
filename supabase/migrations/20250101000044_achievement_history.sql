-- スキル認定のやり取り履歴
CREATE TABLE achievement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('apply', 'reject', 'reapply', 'certify')),
  actor_id UUID NOT NULL REFERENCES employees(id),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_achievement_history_achievement ON achievement_history(achievement_id);

-- RLS
ALTER TABLE achievement_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievement_history_select" ON achievement_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "achievement_history_insert" ON achievement_history FOR INSERT TO authenticated WITH CHECK (true);
