-- 利用者からの改善提案・修正依頼のワークフロー
--   申請 → 運営承認(改善案提案) → 役員承認 → 開発対応 → 完了報告
-- 参照・更新はサーバー（service-role）からのみ行うため RLS を有効化し、
-- 公開ポリシーは付けない（anon/authenticated 不可、service-role のみ）。

create table if not exists improvement_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references employees(id),
  title text not null,
  description text not null,
  category text,                          -- '不具合' | '改善' | '新機能' | 'その他'
  status text not null default 'submitted',
    -- submitted / ops_approved / exec_approved / in_development / completed / rejected
  ops_reviewer_id uuid references employees(id),
  ops_proposal text,                      -- 運営管理者の改善案
  ops_decided_at timestamptz,
  exec_id uuid references employees(id),   -- 承認した意思決定者（役員）
  exec_decided_at timestamptz,
  developer_id uuid references employees(id),
  dev_started_at timestamptz,
  completed_at timestamptz,
  completion_note text,                   -- 完了報告
  rejected_by uuid references employees(id),
  rejected_at timestamptz,
  reject_reason text,
  reject_stage text,                      -- 'ops' | 'exec'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_improvement_requests_status on improvement_requests(status);
create index if not exists idx_improvement_requests_requester on improvement_requests(requester_id);
alter table improvement_requests enable row level security;

-- 進行のタイムライン（申請者への進捗表示・監査用）
create table if not exists improvement_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references improvement_requests(id) on delete cascade,
  actor_id uuid references employees(id),
  type text not null,
    -- submitted / ops_approved / ops_rejected / exec_approved / exec_rejected
    -- / dev_started / completed / comment
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists idx_improvement_events_request on improvement_request_events(request_id, created_at);
alter table improvement_request_events enable row level security;
