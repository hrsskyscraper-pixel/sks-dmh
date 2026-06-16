-- 「チームのリーダー(team_managers)に登録された人は、リーダー権限(training_leader)も持つ」を
-- 構造的に保証する。
--
-- 背景:
--   運用管理者が「リーダーとして招待」した時点で “この人はリーダー” という意思決定は済んでいる
--   （個別招待・一括招待リンク・管理画面の追加、いずれも同じ）。にもかかわらず招待フローは
--   system_permission を training_member のままにしていたため、リーダー登録済みなのに承認できない
--   人が大量に発生していた（秋田の件・65人）。リーダー登録と同時に権限も付与して、これを根絶する。
--   上長(ops_admin/developer)は対象外（権限も育成対象も変えない）。
--
--   既存の sync_leader_as_member（リーダー→メンバー自動追加）に権限付与を追加する。
--
-- 機微列保護トリガとの干渉:
--   protect_employee_sensitive_columns は authenticated ユーザー(auth.uid() 非NULL)による
--   system_permission/role の変更を巻き戻す。招待受諾は service-role(admin client, auth.uid()=NULL)
--   経由なので問題ないが、管理画面からのリーダー追加は authenticated 経由のため巻き戻されてしまう。
--   そこで sync_leader_as_member が正規の付与を行う区間だけ、トランザクションローカルのフラグ
--   app.leader_grant='on' で保護トリガをバイパスする。
--   このフラグは SECURITY DEFINER トリガ内でのみ設定され、PostgREST 経由のクライアントからは
--   設定できない（＝権限昇格には使えない。team_managers への INSERT 自体も RLS でリーダー/管理者に限定）。

-- 1) 機微列保護トリガに「正規のリーダー権限付与」バイパスを追加（他の挙動は不変）
CREATE OR REPLACE FUNCTION protect_employee_sensitive_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- sync_leader_as_member による正規のリーダー権限付与中はバイパス
  IF current_setting('app.leader_grant', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.system_permission := OLD.system_permission;
    NEW.role              := OLD.role;
    NEW.business_role_ids := OLD.business_role_ids;
    NEW.employment_type   := OLD.employment_type;
    NEW.status            := OLD.status;
    NEW.is_test           := OLD.is_test;
    NEW.auth_user_id      := OLD.auth_user_id;
    NEW.approved_by       := OLD.approved_by;
    NEW.approved_at       := OLD.approved_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) リーダー登録時に「メンバー化 ＋ リーダー権限付与（旧 role も dual-write）」を行う
CREATE OR REPLACE FUNCTION sync_leader_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 上長(運用管理者・開発者)は対象外（メンバー化も権限変更もしない）
  IF EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = NEW.employee_id
      AND e.system_permission IN ('ops_admin', 'developer')
  ) THEN
    RETURN NEW;
  END IF;

  -- リーダーは同じチームのメンバーにもする
  INSERT INTO team_members (team_id, employee_id, sort_order)
  VALUES (NEW.team_id, NEW.employee_id, 999)
  ON CONFLICT (team_id, employee_id) DO NOTHING;

  -- リーダー登録＝リーダー権限。メンバー権限のままなら training_leader へ引き上げる。
  -- 旧 role は deriveLegacyRole 同様（業務役職「店長」あり→store_manager / なし→manager）に同期。
  -- 機微列保護トリガをこの UPDATE 区間だけバイパスする。
  PERFORM set_config('app.leader_grant', 'on', true);
  UPDATE employees e
  SET
    system_permission = 'training_leader',
    role = CASE
      WHEN EXISTS (
        SELECT 1 FROM business_roles br
        WHERE br.id = ANY(e.business_role_ids) AND br.name = '店長'
      ) THEN 'store_manager'
      ELSE 'manager'
    END,
    updated_at = now()
  WHERE e.id = NEW.employee_id
    AND e.system_permission = 'training_member';
  PERFORM set_config('app.leader_grant', 'off', true);

  RETURN NEW;
END;
$$;

-- トリガ trg_sync_leader_as_member は既存のものをそのまま使用（関数を置き換えただけ）
