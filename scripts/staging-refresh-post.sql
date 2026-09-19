-- ==================================================================
-- ステージング復元後の後処理（scripts/staging-refresh.sh から実行。ステージング限定）
--   psql -v keep="a@example.com,b@example.com" -f scripts/staging-refresh-post.sql
--
-- 1) マスク: 機微な情報をステージングに増やさない（2026-09-20 決定）
--    - 氏名・所属・スキル・申請の状況は本番どおり残す（画面確認に必要）
--    - メール: 運営チーム（運用管理者・開発者・役員）・テストアカウント・:keep 指定以外は
--      <8桁>@staging.invalid に置換（.invalid は配送されないことが保証された TLD）
--    - LINE ID / LINE 友だち / 生年月日 / Instagram / LINE URL を空に
--    - 招待の宛先メール・通知ログの宛先も同様に置換
--    - マスクした人の auth_user_id は空に（本番の auth はステージングに無い）
-- 2) ログイン紐づけ: Google ログインで auth.users に行ができたとき、メールが一致する
--    社員行の auth_user_id を自動で入れる（本番では invite/[id] が行を作るので不要。ステージング限定）
-- ==================================================================
\set ON_ERROR_STOP on

begin;

-- ---------- 1) マスク ----------
create temp table keep_ids on commit drop as
select e.id
  from public.employees e
 where lower(e.email) = any (select lower(trim(x)) from unnest(string_to_array(:'keep', ',')) as x)
    or e.system_permission in ('ops_admin', 'developer')
    or e.role in ('admin', 'ops_manager', 'executive', 'testuser')
    or e.is_test;

update public.employees e
   set email        = 'm' || left(md5(e.id::text), 8) || '@staging.invalid',
       auth_user_id = null,
       line_user_id = null,
       line_friend  = null,
       birth_date   = null,
       instagram_url = null,
       line_url     = null
 where e.id not in (select id from keep_ids);

-- 運営チームでも LINE には送らない（キー未設定で送れないが、念のため二重に）
update public.employees set line_user_id = null, line_friend = null where line_user_id is not null;

update public.team_invitations
   set target_email = 'i' || left(md5(id::text), 8) || '@staging.invalid'
 where target_email is not null
   and lower(target_email) not in (select lower(email) from public.employees where id in (select id from keep_ids));

update public.notification_log
   set recipient = case when channel = 'email' then 'n' || left(md5(id::text), 8) || '@staging.invalid' else 'masked' end
 where recipient is not null and recipient <> '' and recipient <> 'masked'
   and lower(recipient) not in (select lower(email) from public.employees where id in (select id from keep_ids));

-- ---------- 2) ログイン紐づけ（ステージング限定） ----------
create or replace function public.staging_link_employee_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then return new; end if;
  update public.employees e
     set auth_user_id = new.id
   where lower(e.email) = lower(new.email)
     and (e.auth_user_id is null or not exists (select 1 from auth.users u where u.id = e.auth_user_id));
  return new;
end
$$;
revoke execute on function public.staging_link_employee_on_signup() from anon, authenticated, service_role, public;

drop trigger if exists staging_link_employee on auth.users;
create trigger staging_link_employee
  after insert on auth.users
  for each row execute function public.staging_link_employee_on_signup();

-- すでにステージングでログイン済みの人（auth.users にいる人）は今すぐ紐づける
update public.employees e
   set auth_user_id = u.id
  from auth.users u
 where lower(e.email) = lower(u.email)
   and (e.auth_user_id is null or e.auth_user_id <> u.id);

commit;
