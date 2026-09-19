-- =============================================
-- 認定時の「本人への一言（公開）」と、承認の滞留リマインド
-- =============================================
-- 2026-09-20 決定:
--   - 承認時に、既存のコメント（本人向け）とは別に「本人への一言（公開）」欄を設ける（案A）。
--     書いた一言は announcements（kind='praise'）として本日のお知らせ／タイムラインに出る。
--   - 申請の翌日中に承認されなかったもの（申請の翌々日から）を「滞留」として、承認者名でデイリーレポートと
--     承認者本人のベルに出す。集計は achievements(status, achieved_at) を使うため索引を足す。

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS praise_comment TEXT;
COMMENT ON COLUMN public.achievements.praise_comment IS '認定時の本人への一言（公開。お知らせに投稿される）';

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_kind_check;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_kind_check
  CHECK (kind IN ('grade', 'ranking', 'welcome', 'daily', 'praise'));

CREATE INDEX IF NOT EXISTS idx_achievements_pending_achieved_at
  ON public.achievements (achieved_at)
  WHERE status = 'pending';
