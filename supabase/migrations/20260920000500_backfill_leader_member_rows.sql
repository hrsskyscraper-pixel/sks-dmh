-- =============================================
-- 担当リーダーなのにメンバー行が無い人の補填（データ不整合の解消。2026-09-20 須貝さん決定）
-- =============================================
-- リーダー登録時にメンバー行も作るトリガ（sync_leader_as_member）より前に登録されたリーダーが、
-- メンバー行を持たないまま残っている（本番で3名）。この状態だと
--   ・店舗別スキル状況の「対象」に数えられない
--   ・承認の滞留で「所属なし」に誤分類される（修正済みだが、データも揃えておく）
-- トリガと同じ規則で補う: 上長（ops_admin / developer）は対象外。何度流しても同じ結果（冪等）。
INSERT INTO public.team_members (team_id, employee_id, sort_order)
SELECT tg.team_id, tg.employee_id, 999
FROM public.team_managers tg
JOIN public.employees e ON e.id = tg.employee_id
WHERE e.status = 'approved'
  AND COALESCE(e.system_permission, '') NOT IN ('ops_admin', 'developer')
  AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = tg.team_id AND tm.employee_id = tg.employee_id
  )
ON CONFLICT (team_id, employee_id) DO NOTHING;
