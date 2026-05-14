-- LINE 公式アカウント（Messaging API チャネル）の友だち追加状態を保持する。
-- LINE 連携（line_user_id）が済んでいても、公式アカウントを友だち追加していないと
-- push 通知が届かないため、この状態を分けて持つ。
--   null  = 未確認（旧来の連携済みユーザー。要・友だち追加の確認/再連携）
--   true  = 友だち（通知が届く）
--   false = ブロック/未追加（通知が届かない）
alter table public.employees
  add column if not exists line_friend boolean;

comment on column public.employees.line_friend is
  'LINE公式アカウントを友だち追加済みか。null=未確認, true=友だち, false=未追加/ブロック';
