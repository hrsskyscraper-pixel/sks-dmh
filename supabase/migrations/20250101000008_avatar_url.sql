-- =============================================
-- 007_avatar_url.sql  顔写真機能
-- =============================================

-- employees に avatar_url 列を追加
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- =============================================
-- Supabase Storage: avatars バケット
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 全員が閲覧可能
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- ログインユーザーがアップロード・更新・削除可能
CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- =============================================
-- テスト社員のサンプルアバター（DiceBear）
-- =============================================
UPDATE employees SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/png?seed=Fujii&size=128&backgroundColor=b6e3f4'
  WHERE id = 'a1000000-0000-0000-0000-000000000001';

UPDATE employees SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/png?seed=Takahashi&size=128&backgroundColor=c0aede'
  WHERE id = 'a1000000-0000-0000-0000-000000000002';

UPDATE employees SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/png?seed=Tanaka&size=128&backgroundColor=ffd5dc'
  WHERE id = 'b1000000-0000-0000-0000-000000000001';

UPDATE employees SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/png?seed=Suzuki&size=128&backgroundColor=d1f4cc'
  WHERE id = 'b1000000-0000-0000-0000-000000000002';

UPDATE employees SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/png?seed=Sato&size=128&backgroundColor=ffdfbf'
  WHERE id = 'b1000000-0000-0000-0000-000000000003';

UPDATE employees SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/png?seed=Yamada&size=128&backgroundColor=b6e3f4'
  WHERE id = 'b1000000-0000-0000-0000-000000000004';
