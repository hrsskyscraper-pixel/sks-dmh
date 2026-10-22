-- =============================================
-- Q&A（2026-09-19 MTG 決定 ④）
-- =============================================
-- 誰でも質問でき、誰でも回答でき、全員が見られる。改善提案の上に置く。
-- 書き込み（質問・回答）は運営チーム（app_settings.ops_team_recipient_ids）へ
-- メール／LINE の一括休止に関係なく通知する（改善提案と同じ扱い）。
-- RLS は有効・ポリシー無し＝サーバーの admin client 経由でのみ読み書きする（improvement_requests と同じ型）。

create table if not exists public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references public.employees(id),
  title text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  answer_count integer not null default 0,
  resolved_at timestamptz,
  resolved_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qa_questions_created on public.qa_questions(created_at desc);
create index if not exists idx_qa_questions_status on public.qa_questions(status);
alter table public.qa_questions enable row level security;
comment on table public.qa_questions is 'Q&A の質問。全員が閲覧・投稿できる（admin client 経由）';

create table if not exists public.qa_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  author_id uuid not null references public.employees(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_qa_answers_question on public.qa_answers(question_id, created_at);
alter table public.qa_answers enable row level security;
comment on table public.qa_answers is 'Q&A の回答。全員が投稿できる（admin client 経由）';

grant select, insert, update, delete on public.qa_questions, public.qa_answers to service_role;
