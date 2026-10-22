-- 店長（その店舗の担当リーダー）ご本人の申請を承認する人（2026-10-21 原島さん確定 B-④-3「店長申請 → MG 又は課長」）
-- 店舗ごとに MG・課長などを指定する。原島さん（運用管理者）が設定画面で設定する。
-- 指定された人は、その店舗の担当リーダーの申請を承認センターで承認でき、滞留の知らせも受け取る。
CREATE TABLE IF NOT EXISTS public.team_upper_approvers (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_team_upper_approvers_employee ON public.team_upper_approvers (employee_id);
COMMENT ON TABLE public.team_upper_approvers IS '店長（担当リーダー）ご本人の申請を承認する人。サーバー（admin client）からのみ読み書きする';
ALTER TABLE public.team_upper_approvers ENABLE ROW LEVEL SECURITY;
