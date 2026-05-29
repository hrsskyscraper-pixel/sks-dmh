-- ユーザーごとの文字サイズ設定（UI全体のスケール、単位 %）。
-- <html> の font-size に % として適用し、rem ベースの Tailwind ユーティリティが
-- 全体にカスケードする（ブラウザズームに近い挙動で、レイアウト崩れを防ぐ）。
--   88  = 小
--   100 = 標準（デフォルト）
--   115 = 大
--   130 = 特大
alter table public.employees
  add column if not exists font_scale smallint not null default 100;

alter table public.employees
  drop constraint if exists employees_font_scale_check;
alter table public.employees
  add constraint employees_font_scale_check check (font_scale in (88, 100, 115, 130));

comment on column public.employees.font_scale is
  'UI全体の文字サイズスケール(%). 88=小, 100=標準, 115=大, 130=特大';
