-- =============================================
-- 022_mark_team_requests_read_fn.sql
-- applicant_read_at を安全に更新するための SECURITY DEFINER 関数
-- manager が直接 UPDATE できない RLS を回避しつつ、
-- applicant_read_at のみを更新できる専用関数
-- =============================================

CREATE OR REPLACE FUNCTION mark_team_requests_read(p_request_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_change_requests
  SET applicant_read_at = now()
  WHERE id = ANY(p_request_ids)
    AND applicant_read_at IS NULL
    AND (
      -- 自分の申請（本人が既読）
      requested_by = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
      OR
      -- admin/ops_manager が view-as 中に代理で既読（対象者の申請を既読にする）
      EXISTS (
        SELECT 1 FROM employees
        WHERE auth_user_id = auth.uid()
          AND role IN ('admin', 'ops_manager')
      )
    );
END;
$$;
