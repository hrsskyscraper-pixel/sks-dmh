-- 在職者の確認: 氏名を社員リストの氏名に直す・止める理由に「その他」（理由を書く）を足す
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS fix_name boolean NOT NULL DEFAULT false;
ALTER TABLE public.roster_review_items ADD COLUMN IF NOT EXISTS stop_note text;
ALTER TABLE public.roster_review_items DROP CONSTRAINT IF EXISTS roster_review_items_stop_reason_check;
ALTER TABLE public.roster_review_items ADD CONSTRAINT roster_review_items_stop_reason_check CHECK (stop_reason IN ('left', 'shared', 'duplicate', 'other'));
COMMENT ON COLUMN public.roster_review_items.fix_name IS '反映のとき、MB の氏名を社員リストの氏名に直す';
COMMENT ON COLUMN public.roster_review_items.stop_note IS '止める理由が「その他」のときの理由（店長にも見える）';
