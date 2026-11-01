-- 退職年月日のチェックを、回答が空のときも効くように書き直す（回答が空なら日付も空）
ALTER TABLE public.roster_review_items DROP CONSTRAINT IF EXISTS roster_review_items_left_date_check;
ALTER TABLE public.roster_review_items ADD CONSTRAINT roster_review_items_left_date_check
  CHECK ((store_answer = 'left' AND store_left_date IS NOT NULL) OR (store_answer IS DISTINCT FROM 'left' AND store_left_date IS NULL));
