-- ==========================================================
-- ブランド（CoCo壱、ラーメン大戦争、flax&BEAUTY 等）
-- ==========================================================

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  color text,                     -- 例: '#e53935'
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 初期データ
INSERT INTO brands (name, code, color, sort_order) VALUES
  ('CoCo壱', 'cocoichi', '#e53935', 10),
  ('ラーメン大戦争', 'ramen_taisensou', '#f59e0b', 20),
  ('flax&BEAUTY', 'flax_beauty', '#a855f7', 30);

-- teams にブランド設定（store タイプで利用）
ALTER TABLE teams ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX idx_teams_brand_id ON teams(brand_id);

-- manual_library に複数ブランド対応（配列）
-- 空配列 = 全ブランド共通のマニュアル
ALTER TABLE manual_library ADD COLUMN brand_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_manual_library_brand_ids ON manual_library USING GIN (brand_ids);

-- RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brands_select" ON brands
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE はサーバー側 admin client のみ
