-- 在職者の確認: 店長の回答に「退職済み」を足す（退職年月日を一緒に入れる）
ALTER TABLE public.roster_review_items DROP CONSTRAINT IF EXISTS roster_review_items_store_answer_check;
ALTER TABLE public.roster_review_items ADD CONSTRAINT roster_review_items_store_answer_check CHECK (store_answer IN ('ok', 'ng', 'left'));
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS store_left_date date;
ALTER TABLE public.roster_review_items DROP CONSTRAINT IF EXISTS roster_review_items_left_date_check;
ALTER TABLE public.roster_review_items ADD CONSTRAINT roster_review_items_left_date_check CHECK ((store_answer = 'left') = (store_left_date IS NOT NULL) OR (store_answer IS NULL AND store_left_date IS NULL));
COMMENT ON COLUMN public.roster_review_items.store_left_date IS '店長が「退職済み」と答えたときの退職年月日';
