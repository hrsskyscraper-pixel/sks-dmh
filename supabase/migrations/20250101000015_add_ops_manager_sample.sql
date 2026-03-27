-- =============================================
-- 014_add_ops_manager_sample.sql  運用管理者サンプルデータ追加
-- =============================================

INSERT INTO employees (id, auth_user_id, name, email, hire_date, role)
VALUES (
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  '中村 恵子',
  'nakamura@example.test',
  '2015-04-01',
  'ops_manager'
)
ON CONFLICT (email) DO NOTHING;
