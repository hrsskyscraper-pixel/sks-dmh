-- 在職者の確認: 社員リストの全員を載せ、確認が必要な方（上）と、問題なさそうな方（下）に分ける
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS needs_check boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.roster_review_items.needs_check IS '確認が必要な方か（false＝社員リストと MB に違いが見つからなかった方。下に並べる）';
