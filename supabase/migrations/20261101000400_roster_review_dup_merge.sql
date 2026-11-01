-- 在職者の確認: 重複アカウントを1件の確認にまとめる（この行のアカウントを活かし、同じ名前のほかのアカウントを止める）
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS dup_stop_ids uuid[] NOT NULL DEFAULT '{}';
-- ほかの行にまとめた行（その行のアカウントは、まとめ先の行で止める）
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.roster_review_items(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.roster_review_items.dup_stop_ids IS '重複アカウントとして一緒に止める MB アカウント（employees.id）';
COMMENT ON COLUMN public.roster_review_items.merged_into IS 'この行をまとめた先の行';
