-- テストデータ用フラグ。
-- 社員・チーム（店舗/部署/プロジェクト）に「テスト用」マークを付け、
-- 管理画面の一覧では折りたたみグループにまとめ、ランキング・タイムライン・
-- 統計などの公開表示からは除外する。
--
-- 除外の判定（アプリ側 src/lib/test-data.ts に集約）:
--   テスト社員 = employees.is_test=true / role='testuser' /
--               テスト店舗(チーム)に所属(team_members,team_managers)するメンバー
--   テスト店舗 = teams.is_test=true
alter table public.employees
  add column if not exists is_test boolean not null default false;

alter table public.teams
  add column if not exists is_test boolean not null default false;

comment on column public.employees.is_test is
  'テスト用アカウント。公開表示（ランキング/タイムライン/統計等）から除外し、管理一覧ではテストグループに格納';
comment on column public.teams.is_test is
  'テスト用チーム/店舗。所属メンバーもカスケードで公開表示から除外';

-- 既存の testuser ロールは初期状態でテスト扱いに揃えておく（以後はUIのトグルで管理）
update public.employees set is_test = true where role = 'testuser' and is_test = false;

-- 除外フィルタで使うインデックス（false 行＝本番データのみ部分インデックス）
create index if not exists idx_employees_is_test on public.employees(is_test) where is_test = true;
create index if not exists idx_teams_is_test on public.teams(is_test) where is_test = true;
