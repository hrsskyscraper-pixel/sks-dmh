-- 役職を社内の公式役職（組織図）にそろえる（2026-10-27 須貝さん決定。原島さんには確認のみ）
-- ・MB で利用者に見える役職＝社内の公式役職。アプリの動きは、役職ごとの設定（権限）として結びつける
-- ・full_name: 略称で表示する役職の正式名称（カーソルを合わせると出す）
-- ・standard_permission: その役職の人に最低限付ける承認の権限（案B）。役職を付けると、この権限まで上げる
-- ・is_executive: 改善提案で役員として扱う（これまでは名前が「役員」の役職だけ、とコードに書いていた）
-- 「役員」は、会長・社長・常務取締役の付け替えが済んだら消す（人ごとの付け替えはデータの作業で行う）

ALTER TABLE public.business_roles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS standard_permission text CHECK (standard_permission IN ('training_member', 'training_leader', 'ops_admin')),
  ADD COLUMN IF NOT EXISTS is_executive boolean NOT NULL DEFAULT false;

-- 名前をそろえる（id はそのままなので、付いている人・管理者の申請の対象の設定は引き継がれる）
UPDATE public.business_roles SET name = 'マネージャー', updated_at = now()
  WHERE name = 'MG' AND NOT EXISTS (SELECT 1 FROM public.business_roles WHERE name = 'マネージャー');
UPDATE public.business_roles SET name = 'エリアキャスト', updated_at = now()
  WHERE name = 'AC' AND NOT EXISTS (SELECT 1 FROM public.business_roles WHERE name = 'エリアキャスト');

-- 足りない役職を足す
INSERT INTO public.business_roles (name, sort_order)
SELECT v.name, v.sort_order FROM (VALUES
  ('代表取締役会長', 1), ('代表取締役社長', 2), ('常務取締役', 3),
  ('次期エリアキャスト補佐候補', 36), ('TAMG', 37), ('GSDM', 38),
  ('店長補佐', 45), ('事務員', 70)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.business_roles b WHERE b.name = v.name);

-- 正式名称・標準の承認の権限・役員扱い
UPDATE public.business_roles b SET
  full_name = v.full_name,
  standard_permission = v.perm,
  is_executive = v.exec,
  updated_at = now()
FROM (VALUES
  ('代表取締役会長', NULL, 'ops_admin', true),
  ('代表取締役社長', NULL, 'ops_admin', true),
  ('常務取締役', NULL, 'ops_admin', true),
  ('役員', NULL, 'ops_admin', true),
  ('部長', NULL, 'ops_admin', false),
  ('課長', NULL, 'training_leader', false),
  ('マネージャー', NULL, 'training_leader', false),
  ('エリアキャスト', NULL, 'training_leader', false),
  ('店長', NULL, 'training_leader', false),
  ('TAMG', 'Technical Advisor Manager', 'training_leader', false),
  ('店長補佐', NULL, 'training_member', false),
  ('GSDM', 'Global Staff Development Manager', 'training_member', false),
  ('事務員', NULL, 'training_member', false),
  ('次期エリアキャスト補佐候補', NULL, 'training_member', false)
) AS v(name, full_name, perm, exec)
WHERE b.name = v.name;
