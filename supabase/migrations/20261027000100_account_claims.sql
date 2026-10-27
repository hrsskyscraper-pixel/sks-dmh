-- 管理者側でアカウントを発行する（2026-10-27 須貝さん決定）
-- これまでは招待リンクから本人が登録し、区分（社員／メイト）や店舗を本人・承認者が選んでいたため、選び間違いが起きていた。
-- 運用管理者が社員リスト（正）の内容で社員データを先に作り、本人用のログインリンク（1回だけ使える）を渡す。
-- 本人はリンクを開いて自分の Google アカウントでログインするだけで、その社員データにつながる。
--
-- 発行したばかりの社員データは auth_user_id が空で、メールは仮の値（<id>@issue.invalid）。
-- ログインしたときに、本人の Google のメールに置き換える。

CREATE TABLE IF NOT EXISTS public.account_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- リンクの合言葉を兼ねる（推測できない乱数）
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_account_claims_employee ON public.account_claims(employee_id);

-- 読み書きはサーバー（admin client）だけ。ブラウザからは触れない（ポリシーを作らない＋権限を付けない）
ALTER TABLE public.account_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_claims FROM anon, authenticated;
