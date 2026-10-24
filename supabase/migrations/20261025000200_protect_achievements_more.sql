-- スキル申請の保護の続き（2026-10-25 再点検の指摘）
-- ・申請（insert）で、数え方に使う列（cumulative_hours_at_achievement・notes）と差し戻し理由を入れられないようにする
--   （チェックポイント最短記録は cumulative_hours_at_achievement で並べるため、0 を入れると1位になれた）
-- ・申請日（achieved_at）は、ブラウザから書くときはその時刻に固定する（滞留の知らせを前後にずらせないように）
-- ・写真のパスは本人のフォルダ（<employee_id>/...）のものだけ（他人の写真を自分の申請に付けられないように）
-- ・申請の履歴（achievement_history）は、本人が自分の申請に「申請」「再申請」を書くときだけ
--   （認定・差し戻しの履歴はサーバーが admin client で書く。偽の「認定しました」の通知を作れないように）

DROP POLICY IF EXISTS achievements_insert_own ON public.achievements;
CREATE POLICY achievements_insert_own ON public.achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = (SELECT employees.id FROM employees WHERE employees.auth_user_id = (SELECT auth.uid()) LIMIT 1)
    AND status = 'pending'
    AND certified_by IS NULL
    AND certified_at IS NULL
    AND certify_comment IS NULL
    AND praise_comment IS NULL
    AND celebrated_at IS NULL
    AND cumulative_hours_at_achievement IS NULL
    AND notes IS NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(photo_paths, '{}')) AS p WHERE p NOT LIKE employee_id::text || '/%')
  );

DROP POLICY IF EXISTS achievements_update_own_reapply ON public.achievements;
CREATE POLICY achievements_update_own_reapply ON public.achievements
  FOR UPDATE TO authenticated
  USING (
    employee_id = (SELECT employees.id FROM employees WHERE employees.auth_user_id = (SELECT auth.uid()) LIMIT 1)
    AND status = 'rejected'
  )
  WITH CHECK (
    employee_id = (SELECT employees.id FROM employees WHERE employees.auth_user_id = (SELECT auth.uid()) LIMIT 1)
    AND status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(photo_paths, '{}')) AS p WHERE p NOT LIKE employee_id::text || '/%')
  );

-- 申請日は、ブラウザから書くときはその時刻にする（insert・再申請とも）
CREATE OR REPLACE FUNCTION public.set_achievement_applied_at()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.achieved_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS trg_set_achievement_applied_at ON public.achievements;
CREATE TRIGGER trg_set_achievement_applied_at
  BEFORE INSERT OR UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.set_achievement_applied_at();

-- 履歴: 本人が、自分の申請に「申請」「再申請」を書くときだけ
DROP POLICY IF EXISTS achievement_history_insert ON public.achievement_history;
CREATE POLICY achievement_history_insert ON public.achievement_history
  FOR INSERT TO authenticated
  WITH CHECK (
    action IN ('apply', 'reapply')
    AND actor_id = (SELECT employees.id FROM employees WHERE employees.auth_user_id = (SELECT auth.uid()) LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM achievements a
      WHERE a.id = achievement_id
        AND a.employee_id = (SELECT employees.id FROM employees WHERE employees.auth_user_id = (SELECT auth.uid()) LIMIT 1)
    )
  );
