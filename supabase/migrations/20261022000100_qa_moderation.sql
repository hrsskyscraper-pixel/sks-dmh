-- Q&A の不適切な投稿を非表示にする（2026-10-21 原島さん確定 A-8）
-- 削除はせず、非表示にして記録を残す（間違えても戻せる）。誰がいつ非表示にしたかは hidden_by / hidden_at と監査ログに残す。
-- 非表示にできる人は app_settings.qa_moderator_ids（設定画面で変更できる）。

ALTER TABLE public.qa_questions ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.qa_questions ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.qa_answers ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.qa_answers ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.qa_questions.hidden_at IS '運営が非表示にした日時（NULL は表示中）';
COMMENT ON COLUMN public.qa_answers.hidden_at IS '運営が非表示にした日時（NULL は表示中）';

-- 非表示にできる人の初期値: 諸沢社長・菅原部長・原島さん・須貝（2026-10-21 原島さん指定）。
-- 氏名ではなく社員ID で指定する（氏名は本人が変えられるため、名前で引くと別人が入りうる）。
-- ID は本番・開発版で同じ（開発版は本番の複製）。2026-10-22 に本番で 4 名とも一致することを確認した。
-- すでに設定があるときは触らない（設定画面で変えた内容を上書きしない）。
INSERT INTO public.app_settings (key, value)
SELECT 'qa_moderator_ids', COALESCE(jsonb_agg(e.id ORDER BY e.name), '[]'::jsonb)
FROM public.employees e
WHERE e.id IN (
  'fe1a1799-b684-4f5d-af7d-46649f372ee7',  -- 諸沢 莉乃
  'ea0f78ce-e684-43ec-a877-67f3e87f3b6c',  -- 菅原 香織
  'a58548eb-41a1-4f30-ab1a-ba27f9c6c7de',  -- 原島 愛里
  '3971634c-b29b-4cf5-81f8-66e34a851942'   -- 須貝 裕保
)
ON CONFLICT (key) DO NOTHING;
