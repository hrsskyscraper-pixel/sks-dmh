-- 名簿の「店舗部署」と、Mission Board の所属（店舗・部署）の突き合わせ（2026-10-19 原島さん要望 B-⑥）
-- 名簿の店舗部署は所属の上書きには使わず、違いを運用管理者に知らせるためだけに持つ。

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS roster_dept TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS roster_dept_at TIMESTAMPTZ;
COMMENT ON COLUMN public.employees.roster_dept IS '人事の名簿の「店舗部署」（名簿の一括取込で登録。所属の判定には使わず、所属との違いの確認だけに使う）';
COMMENT ON COLUMN public.employees.roster_dept_at IS 'roster_dept を名簿から取り込んだ日時';

-- 名簿の店舗部署名と、アプリの店舗・部署の対応づけ（名前の書き方が違うとき用。運用管理者が画面で設定）
CREATE TABLE IF NOT EXISTS public.roster_dept_aliases (
  roster_name TEXT PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.roster_dept_aliases IS '名簿の店舗部署名（空白・全角半角を揃えた形）→ アプリの店舗・部署。サーバー（admin client）からのみ読み書きする';
ALTER TABLE public.roster_dept_aliases ENABLE ROW LEVEL SECURITY;
