-- ==========================================================
-- マニュアル連携: Teach me Biz 等のマニュアルシステムと紐付け
-- ==========================================================

-- マニュアルライブラリ（外部マニュアルサービスのミラー）
CREATE TABLE manual_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teachme_manual_id text UNIQUE NOT NULL,    -- URLから抽出したID
  title text NOT NULL,
  url text NOT NULL,
  folder_path text[],                         -- ['01.身嗜み', '02.服装'] 等
  publish_status text,                        -- published / draft / archived
  access_count int DEFAULT 0,
  views_within_a_year int DEFAULT 0,
  search_tags text[],
  archived boolean DEFAULT false,
  source_updated_at timestamptz,              -- CSV上の最終更新日時
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_library_archived ON manual_library(archived);
CREATE INDEX idx_manual_library_title ON manual_library(title);

-- スキル ↔ マニュアル 多対多リンク
CREATE TABLE skill_manuals (
  skill_id uuid REFERENCES skills(id) ON DELETE CASCADE,
  manual_id uuid REFERENCES manual_library(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (skill_id, manual_id)
);

CREATE INDEX idx_skill_manuals_skill ON skill_manuals(skill_id);
CREATE INDEX idx_skill_manuals_manual ON skill_manuals(manual_id);

-- RLS
ALTER TABLE manual_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_manuals ENABLE ROW LEVEL SECURITY;

-- SELECT: 全認証ユーザーが閲覧可能（マニュアルは全社員が見る）
CREATE POLICY "manual_library_select" ON manual_library
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "skill_manuals_select" ON skill_manuals
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE はサーバー側 admin client のみ
