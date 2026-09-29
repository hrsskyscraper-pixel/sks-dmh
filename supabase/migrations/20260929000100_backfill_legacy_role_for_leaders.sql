-- 旧 role 列を deriveLegacyRole（admin/business-roles/actions.ts）と同じ規則で揃える。
--
-- 背景: system_permission='training_leader' なのに role='employee' のままの社員が本番に15名いた
-- （2026-09-29 確認）。リーダー登録・権限変更の両方で role を dual-write する仕組み
-- （migration 20250101000064 と updateEmployeePermission）が入る前の行。
-- 権限判定は system_permission を優先するため「できること」は既に正しかったが、
-- 旧 role を見ている表示（仲間カード・ダッシュボードのバッジ、承認センターの役職フィルタ）で
-- リーダーとして扱われていなかった。
--
-- system_permission は変更しない（＝権限は変わらない）。書き換えるのは旧 role だけ。
-- role='testuser' は QA プレビュー用に特別扱いされているため対象外にする。
-- 冪等: 既に揃っている行は where 句で除かれるので、何度流しても同じ結果になる。

update public.employees e
   set role = case
                when exists (
                  select 1 from public.business_roles br
                  where br.id = any(e.business_role_ids) and br.name = '店長'
                ) then 'store_manager'
                else 'manager'
              end,
       updated_at = now()
 where e.system_permission::text = 'training_leader'
   and e.role <> 'testuser'
   and e.role <> case
                   when exists (
                     select 1 from public.business_roles br
                     where br.id = any(e.business_role_ids) and br.name = '店長'
                   ) then 'store_manager'
                   else 'manager'
                 end;
