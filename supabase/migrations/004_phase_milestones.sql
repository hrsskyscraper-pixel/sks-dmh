-- =============================================
-- 標準進捗マイルストーン設定テーブル
-- =============================================

CREATE TABLE IF NOT EXISTS phase_milestones (
  phase       TEXT        PRIMARY KEY CHECK (phase IN ('4月', '5月〜6月', '7月〜8月')),
  end_hours   INTEGER     NOT NULL CHECK (end_hours > 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期値（コードに書いていた定数と同じ値）
INSERT INTO phase_milestones (phase, end_hours) VALUES
  ('4月',      500),
  ('5月〜6月', 900),
  ('7月〜8月', 1400)
ON CONFLICT (phase) DO NOTHING;

-- updated_at 自動更新トリガー
CREATE TRIGGER update_phase_milestones_updated_at
  BEFORE UPDATE ON phase_milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS
-- =============================================

ALTER TABLE phase_milestones ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザー全員が閲覧可（ダッシュボードで使用）
CREATE POLICY "phase_milestones_select_authenticated" ON phase_milestones
  FOR SELECT TO authenticated USING (true);

-- admin のみ更新可
CREATE POLICY "phase_milestones_update_admin" ON phase_milestones
  FOR UPDATE TO authenticated
  USING (get_current_role() = 'admin');
