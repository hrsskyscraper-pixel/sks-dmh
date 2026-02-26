-- =============================================
-- 021_team_change_requests_proxy_insert.sql
-- admin/ops_manager が view-as 中に代理申請できるよう RLS を更新
-- =============================================

DROP POLICY IF EXISTS "team_change_requests_insert" ON team_change_requests;

CREATE POLICY "team_change_requests_insert" ON team_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    -- 自分名義の申請（manager 以上）
    requested_by = (
      SELECT id FROM employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('manager', 'admin', 'ops_manager')
    )
    OR
    -- admin/ops_manager が view-as で他の manager の代理申請
    (
      EXISTS (
        SELECT 1 FROM employees
        WHERE auth_user_id = auth.uid()
          AND role IN ('admin', 'ops_manager')
      )
      AND
      requested_by IN (
        SELECT id FROM employees
        WHERE role IN ('manager', 'admin', 'ops_manager')
      )
    )
  );
