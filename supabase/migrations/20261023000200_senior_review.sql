-- B-④-3（2026-10-23 原島さん確定）: 管理者（MG・AC・課長）の申請は、部長・常務・社長だけが承認する。
-- 役職の上下は 役員 → 部長 → 課長 → MG → AC → 店長 → 女将（2026-10-22 原島さん）。
-- 「課長」「AC」は 10/21 に追加の依頼をいただいた役職。すでにあれば何もしない。
INSERT INTO public.business_roles (name, sort_order) VALUES ('課長', 25), ('AC', 35)
ON CONFLICT (name) DO NOTHING;

-- 対象の役職（設定画面から変えられる）。承認する人は設定画面で選ぶ。
-- 承認する人が未設定のあいだは、これまでどおり（運用管理者ならだれでも承認できる）。
INSERT INTO public.app_settings (key, value)
SELECT 'senior_review_role_ids', COALESCE(jsonb_agg(id ORDER BY sort_order), '[]'::jsonb)
FROM public.business_roles WHERE name IN ('課長', 'MG', 'AC')
ON CONFLICT (key) DO NOTHING;
