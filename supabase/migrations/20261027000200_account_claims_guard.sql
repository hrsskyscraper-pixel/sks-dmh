-- アカウントの発行の点検（2026-10-27）で見つかったことへの手当て
-- 1つの Google アカウントは、1人の社員データにだけつながるようにする（本番・ステージングとも重複 0 件を確認済み）
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_auth_user_id ON public.employees(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 本人用のログインリンクの期限を 14 日にする（漏れたときに使われうる期間を短くする）
ALTER TABLE public.account_claims ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');
