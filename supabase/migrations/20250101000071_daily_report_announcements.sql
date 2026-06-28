-- =============================================
-- 071_daily_report_announcements.sql
-- 毎朝の「デイリーレポート（前日の承認サマリー）」をお知らせ／タイムラインに投稿するため、
-- announcements.kind に 'daily' を追加。period='YYYY-MM-DD'（前日の日付）で1日1件に重複防止。
-- =============================================

ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_kind_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_kind_check CHECK (kind IN ('grade', 'ranking', 'welcome', 'daily'));

-- デイリーレポートは対象日(period='YYYY-MM-DD')につき1件
CREATE UNIQUE INDEX IF NOT EXISTS uniq_announcements_daily_period ON announcements (period) WHERE kind = 'daily';
