-- =============================================
-- レベルアップ演出・ログイン記録・退職日（2026-09-19 MTG 決定 ②⑦）
-- =============================================

-- ② 承認がおりたあと、本人が次にアプリを開いたときに一度だけ演出を出す。
--    見せたら celebrated_at を入れる。既存の認定済みは「見せた扱い」にして、導入直後に過去分が一斉に出ないようにする。
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS celebrated_at TIMESTAMPTZ;
COMMENT ON COLUMN public.achievements.celebrated_at IS '認定の演出（レベルアップ）を本人に見せた日時。NULL＝まだ見せていない';
UPDATE public.achievements SET celebrated_at = COALESCE(certified_at, created_at) WHERE status = 'certified' AND celebrated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_achievements_uncelebrated ON public.achievements (employee_id) WHERE status = 'certified' AND celebrated_at IS NULL;

-- ⑦ ログイン記録: 1人1日1行（JST）。「週1回以上の利用率」などの効果測定に使う。
CREATE TABLE IF NOT EXISTS public.login_days (
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  first_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, day)
);
CREATE INDEX IF NOT EXISTS idx_login_days_day ON public.login_days (day);
ALTER TABLE public.login_days ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.login_days IS 'ログイン（利用）記録。1人1日1行、JST。サーバーの admin client からのみ書く';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_days TO service_role;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
COMMENT ON COLUMN public.employees.last_login_at IS '最終利用日時（login_days と同時に更新）';

-- ⑦ 退職日: 退職時にアカウント停止と一緒に記録する。在籍日数＝退職日（無ければ今日）− 入社日。
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS left_at DATE;
COMMENT ON COLUMN public.employees.left_at IS '退職日。NULL＝在籍中';
