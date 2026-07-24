-- 通知（メール・LINE）の送信結果ログ。失敗の可視化用。
-- 参照は管理者ページ（service-role）からのみ行うため、RLS は有効化し
-- 公開ポリシーは付けない（anon/authenticated からは不可、service-role のみ）。
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  category text not null,      -- 'join_request' / 'approval' / 'invitation' 等
  channel text not null,       -- 'email' / 'line'
  recipient text not null,     -- 宛先（メールアドレス / LINE userId / 概要）
  subject text,                -- 件名・概要
  status text not null,        -- 'success' / 'failed'
  error text,                  -- 失敗時のエラー内容
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_log_created on notification_log (created_at desc);

alter table notification_log enable row level security;
