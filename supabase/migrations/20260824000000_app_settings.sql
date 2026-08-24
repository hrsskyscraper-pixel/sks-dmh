-- アプリ全体の設定を保持する key/value テーブル。
-- 第一の用途はメール通知の一括ON/OFF（休止スイッチ）。今後の全体設定もここに追加する。
--
-- 参照・更新はサーバー側（service-role）からのみ行うため、RLS は有効化し
-- 公開ポリシーは付けない（anon/authenticated からは読み書き不可）。
-- 一般ユーザーが直接書き換えて通知を止められないようにするための構造的な歯止め。
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- メール通知の一括スイッチ。既定は有効（true）。
-- 行が無い場合もアプリ側は「有効」として扱う（src/lib/settings.ts）。
insert into app_settings (key, value)
values ('email_notifications_enabled', 'true'::jsonb)
on conflict (key) do nothing;
