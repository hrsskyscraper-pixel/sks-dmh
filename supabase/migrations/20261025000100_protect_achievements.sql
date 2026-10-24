-- スキル申請（achievements）を、ブラウザから本人が「認定済み」にできないようにする（2026-10-25 セキュリティ点検）
-- これまで:
--   achievements_insert_own        … 自分の行なら、どの status でも入れられた（'certified' で入れれば承認なしで認定）
--   achievements_update_own_reapply … 自分の行なら、どの列もどの値にでも書き換えられた（certified_by の偽装も）
--   achievements_update_manager     … 旧 role（manager/admin）の人が、ブラウザから全員の行を書き換えられた
-- アプリがブラウザから書くのは「申請（pending で入れる）」と「差し戻し → 再申請」だけ。
-- 認定・差し戻し・お祝いの印などは、すべてサーバー（admin client。auth.uid() が NULL）で書くので、この変更の影響を受けない。

-- 申請: 本人の行を、申請中（pending）として、承認の欄を空のまま入れるときだけ
DROP POLICY IF EXISTS achievements_insert_own ON public.achievements;
CREATE POLICY achievements_insert_own ON public.achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = (SELECT employees.id FROM employees WHERE employees.auth_user_id = (SELECT auth.uid()) LIMIT 1)
    AND status = 'pending'
    AND certified_by IS NULL
    AND certified_at IS NULL
    AND praise_comment IS NULL
    AND celebrated_at IS NULL
  );

-- 再申請: 本人の差し戻し（rejected）の行を、申請中（pending）に戻すときだけ
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
  );

-- 旧 role での書き換えは使っていない（承認はサーバーの API で行う）ので外す
DROP POLICY IF EXISTS achievements_update_manager ON public.achievements;

-- 再申請で本人が書いてよい列は status・achieved_at・apply_comment・certify_comment（空に戻すだけ）・photo_paths。
-- それ以外（だれが・いつ認定したか、一言、どのスキルか など）は、ブラウザから書かれても元に戻す
CREATE OR REPLACE FUNCTION public.protect_achievement_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.id                              := OLD.id;
    NEW.employee_id                     := OLD.employee_id;
    NEW.skill_id                        := OLD.skill_id;
    NEW.certified_by                    := OLD.certified_by;
    NEW.certified_at                    := OLD.certified_at;
    NEW.praise_comment                  := OLD.praise_comment;
    NEW.celebrated_at                   := OLD.celebrated_at;
    NEW.is_read                         := OLD.is_read;
    NEW.notes                           := OLD.notes;
    NEW.cumulative_hours_at_achievement := OLD.cumulative_hours_at_achievement;
    NEW.created_at                      := OLD.created_at;
    IF NEW.certify_comment IS NOT NULL THEN
      NEW.certify_comment := OLD.certify_comment;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS trg_protect_achievement_columns ON public.achievements;
CREATE TRIGGER trg_protect_achievement_columns
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.protect_achievement_columns();
