-- =============================================
-- 065_skill_application_photos.sql
-- スキル申請に写真を添付（最大4枚・任意）し、承認者が確認できるようにする。
-- 写真は非公開バケットに保存し、閲覧はサーバーの service-role が発行する
-- 署名付きURL経由で行う（URLが漏れても期限で無効化される）。
-- =============================================

-- achievements に写真のストレージパス配列を追加（URLではなくパスを保持）
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS photo_paths TEXT[] NOT NULL DEFAULT '{}';

-- =============================================
-- Supabase Storage: skill-photos バケット（非公開）
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'skill-photos', 'skill-photos', false,  -- 非公開（公開URLは生成不可・署名付きURLで閲覧）
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ログインユーザーがアップロード・更新・削除可能（アバターと同じ運用方針）。
-- SELECT ポリシーは作らない＝非公開。閲覧は承認画面・本人画面で
-- service-role クライアントが createSignedUrl して渡す。
CREATE POLICY "skill_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'skill-photos');

CREATE POLICY "skill_photos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'skill-photos');

CREATE POLICY "skill_photos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'skill-photos');
