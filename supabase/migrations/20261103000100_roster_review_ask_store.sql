-- 在職者の確認: 「店長に確認する」（内容が分からない方を、いまのままにして店長に確かめる）と、店長への質問
ALTER TABLE public.roster_review_items DROP CONSTRAINT IF EXISTS roster_review_items_action_check;
ALTER TABLE public.roster_review_items ADD CONSTRAINT roster_review_items_action_check CHECK (action IN ('undecided', 'none', 'change', 'stop', 'issue', 'skip', 'ask'));
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS store_question text;
COMMENT ON COLUMN public.roster_review_items.store_question IS '「店長に確認する」行で、店長に聞きたいこと（店長に見える）';
