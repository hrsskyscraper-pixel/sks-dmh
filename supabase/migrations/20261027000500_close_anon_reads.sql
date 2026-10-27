-- ログインしていない人（anon）から読める・書ける表を閉じる（2026-10-27 セキュリティ監査。本番でも同じ状態を確認）
--
-- admin_audit_log（操作の記録）: ポリシーが「だれでも読める（USING true）」「だれでも書ける（WITH CHECK true）」で、
--   公開されている anon キーだけで全件を読め、偽の記録を足せた。アプリは読むのも書くのもサーバー（admin client）だけなので、
--   ブラウザ（anon・authenticated）からは一切触れないようにする。
-- announcements / announcement_comments / announcement_reactions（お知らせ・タイムライン）: 「だれでも読める」で、
--   ログインしていない人にも氏名入りの投稿が読めた。読めるのはログインしている人だけにする（コメント・♡はブラウザから読み書きする）。

-- 操作の記録
DROP POLICY IF EXISTS approval_roles_can_read_audit ON public.admin_audit_log;
DROP POLICY IF EXISTS service_role_can_insert_audit ON public.admin_audit_log;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;

-- お知らせ・タイムライン
DROP POLICY IF EXISTS announcements_select_all ON public.announcements;
CREATE POLICY announcements_select_all ON public.announcements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS announcement_comments_select_all ON public.announcement_comments;
CREATE POLICY announcement_comments_select_all ON public.announcement_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS announcement_reactions_select_all ON public.announcement_reactions;
CREATE POLICY announcement_reactions_select_all ON public.announcement_reactions FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.announcements, public.announcement_comments, public.announcement_reactions FROM anon;
