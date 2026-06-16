-- 「チームのリーダー(team_managers)は、そのチームのメンバー(team_members)でもある」を
-- 構造的に保証する。これにより:
--   - リーダーがメンバー一覧（育成対象）に出る（冨野さんの「アカウントが無い」状態の解消）
--   - リーダー自身のスキル申請が、同じチームの“他の”リーダーから見える＝承認できる
--     （B案: 同一チームで承認リーダー兼メンバーを許可。自己承認はアプリ側で禁止）
--
-- 上長（運用管理者=ops_admin / 開発者=developer）は「チームのリーダー」ではなく監督者なので、
-- 育成対象（ランキング・申請）に混ざらないよう自動メンバー化の対象外とする。
--
-- リーダー招待やチーム作成など team_managers への INSERT 経路は複数あるため、
-- アプリ側で各経路を直すのではなく DB トリガで一元的に担保する（再発防止）。

-- 1) 既存分のバックフィル: リーダーなのにメンバーでない人をメンバーにも追加（上長は除外）
INSERT INTO team_members (team_id, employee_id, sort_order)
SELECT tm.team_id, tm.employee_id, 999
FROM team_managers tm
JOIN employees e ON e.id = tm.employee_id
WHERE e.system_permission NOT IN ('ops_admin', 'developer')
ON CONFLICT (team_id, employee_id) DO NOTHING;

-- 2) 以降の team_managers INSERT で自動的にメンバーにも追加するトリガ
--    SECURITY DEFINER: どのクライアント（service role / 認証ユーザー）からの INSERT でも
--    team_members への追加が RLS で弾かれないようにする。
CREATE OR REPLACE FUNCTION sync_leader_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = NEW.employee_id
      AND e.system_permission IN ('ops_admin', 'developer')
  ) THEN
    INSERT INTO team_members (team_id, employee_id, sort_order)
    VALUES (NEW.team_id, NEW.employee_id, 999)
    ON CONFLICT (team_id, employee_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_leader_as_member ON team_managers;
CREATE TRIGGER trg_sync_leader_as_member
  AFTER INSERT ON team_managers
  FOR EACH ROW EXECUTE FUNCTION sync_leader_as_member();
