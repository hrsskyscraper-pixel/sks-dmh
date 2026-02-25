-- =============================================
-- 雇用タイプ（新卒 / メイト）対応
-- =============================================

-- employees に employment_type カラムを追加
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT '新卒'
  CHECK (employment_type IN ('新卒', 'メイト'));

-- =============================================
-- phase_milestones を雇用タイプ別に拡張
-- =============================================

-- 既存の PK を削除して複合 PK に変更
ALTER TABLE phase_milestones DROP CONSTRAINT IF EXISTS phase_milestones_pkey;

ALTER TABLE phase_milestones
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT '新卒'
  CHECK (employment_type IN ('新卒', 'メイト'));

ALTER TABLE phase_milestones ADD PRIMARY KEY (phase, employment_type);

-- メイト用デフォルトマイルストーン（パートタイム想定：新卒の約40%の時間）
INSERT INTO phase_milestones (phase, employment_type, end_hours) VALUES
  ('4月',      'メイト', 200),
  ('5月〜6月', 'メイト', 400),
  ('7月〜8月', 'メイト', 700)
ON CONFLICT DO NOTHING;

-- RLS: upsert に INSERT も必要なため追加
DROP POLICY IF EXISTS "phase_milestones_insert_admin" ON phase_milestones;
CREATE POLICY "phase_milestones_insert_admin" ON phase_milestones
  FOR INSERT TO authenticated
  WITH CHECK (get_current_role() = 'admin');

-- =============================================
-- テストデータ: 鈴木・山田をメイトに設定
-- =============================================
UPDATE employees SET employment_type = 'メイト'
WHERE email IN ('suzuki@example.test', 'yamada@example.test');
