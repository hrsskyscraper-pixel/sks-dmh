-- アカウントの発行の依頼（2026-10-27 須貝さん）
-- 新しく入る方の登録は、運用管理者による発行だけにした。店長などのリーダーが「だれのアカウントが要るか」を
-- この依頼で伝え、運用管理者は依頼の内容を社員リストで確かめてから発行する。

CREATE TABLE IF NOT EXISTS public.account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  last_name text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_kana text,
  first_kana text,
  employee_number text,
  employment_type text CHECK (employment_type IN ('社員', 'メイト')),
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  business_role_ids uuid[] NOT NULL DEFAULT '{}',
  hire_date date,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'declined')),
  handled_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  handled_at timestamptz,
  decline_reason text,
  issued_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_requests_status ON public.account_requests(status, created_at);

-- 読み書きはサーバー（admin client）だけ
ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_requests FROM anon, authenticated;
