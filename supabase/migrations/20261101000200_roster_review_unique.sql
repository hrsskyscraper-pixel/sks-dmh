-- 在職者の確認: 1つの確認の中で、同じ MB のアカウントに2つの行を作らない（反映が2回かかるのを防ぐ）
CREATE UNIQUE INDEX IF NOT EXISTS uq_roster_review_items_employee ON public.roster_review_items(batch_id, employee_id) WHERE employee_id IS NOT NULL;
