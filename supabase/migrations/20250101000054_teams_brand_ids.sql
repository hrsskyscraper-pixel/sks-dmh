-- teams に brand_ids 配列を追加（部署・チームが複数ブランドに所属可能に）
-- 既存の brand_id は互換のため残し、store type では brand_ids[0] と同期させる

ALTER TABLE teams
  ADD COLUMN brand_ids uuid[] NOT NULL DEFAULT '{}';

-- 既存データ移行: brand_id が設定されているものは brand_ids に反映
UPDATE teams
SET brand_ids = ARRAY[brand_id]
WHERE brand_id IS NOT NULL;

CREATE INDEX idx_teams_brand_ids ON teams USING GIN (brand_ids);
