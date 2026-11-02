-- 在職者の確認: 社員リストに無い方（MB にだけアカウントがある方）を、店長が「在籍している」と答えたときの、原島さん（＋人事）の確認
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS hr_checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS hr_note text;
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS hr_by uuid REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS hr_at timestamptz;
COMMENT ON COLUMN public.roster_review_items.hr_checked IS '社員リストに無い方を店長が在籍と答えたとき、原島さんが人事に確かめた';
