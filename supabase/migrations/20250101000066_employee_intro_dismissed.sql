-- =============================================
-- 066_employee_intro_dismissed.sql
-- ログイン時のツール説明モーダルの「今後、表示しない」設定。
-- NULL = 表示する / 値あり = 非表示（チェックした日時を記録）。
-- 機微列ガード(061)の対象外なので、本人のブラウザ更新で保存できる。
-- =============================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS intro_dismissed_at TIMESTAMPTZ;
