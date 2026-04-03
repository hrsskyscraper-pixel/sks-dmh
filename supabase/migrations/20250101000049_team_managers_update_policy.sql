-- team_managers: admin/ops_manager/executive のみ UPDATE 可能
CREATE POLICY "team_managers_update" ON team_managers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid()
        AND e.role IN ('admin', 'ops_manager', 'executive')
    )
  );

-- team_members にも UPDATE ポリシー追加（sort_order 更新用）
CREATE POLICY "team_members_update" ON team_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid()
        AND e.role IN ('admin', 'ops_manager', 'executive')
    )
  );
