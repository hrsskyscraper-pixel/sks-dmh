-- ==========================================================
-- 権限モデル再設計 Phase 1
--   employees.role（単一カラム）を
--     - business_role_ids[]（業務役職・マスタ参照・複数可）
--     - system_permission（システム権限・単一値）
--   に分離する。
--   旧 role カラムは互換のため Phase 5 まで残す。
-- ==========================================================

-- ----------------------------------------------------------
-- 1. 業務役職マスタ
-- ----------------------------------------------------------
CREATE TABLE business_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO business_roles (name, sort_order) VALUES
  ('役員',     10),
  ('部長',     20),
  ('MG',       30),
  ('店長',     40),
  ('女将',     50),
  ('育成担当', 60);

ALTER TABLE business_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_roles_select" ON business_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- INSERT/UPDATE/DELETE はサーバー側 admin client のみ

-- ----------------------------------------------------------
-- 2. employees へのカラム追加
-- ----------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN business_role_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN system_permission text
    CHECK (system_permission IN ('developer','ops_admin','training_leader','training_member'));

CREATE INDEX idx_employees_business_role_ids ON employees USING GIN (business_role_ids);
CREATE INDEX idx_employees_system_permission ON employees(system_permission);

-- ----------------------------------------------------------
-- 3. 既存 role から新カラムへのデータ移行
--    マッピング:
--      admin         -> developer        / 業務役職なし
--      testuser      -> developer        / 業務役職なし
--      executive     -> ops_admin        / 役員
--      ops_manager   -> ops_admin        / 部長
--      manager       -> training_leader  / MG
--      store_manager -> training_leader  / 店長
--      employee      -> training_member  / 業務役職なし
-- ----------------------------------------------------------
UPDATE employees SET system_permission = CASE role
  WHEN 'admin'         THEN 'developer'
  WHEN 'testuser'      THEN 'developer'
  WHEN 'executive'     THEN 'ops_admin'
  WHEN 'ops_manager'   THEN 'ops_admin'
  WHEN 'manager'       THEN 'training_leader'
  WHEN 'store_manager' THEN 'training_leader'
  WHEN 'employee'      THEN 'training_member'
  ELSE 'training_member'
END;

-- 業務役職の自動付与（旧 role から推定できるもののみ）
WITH role_map AS (
  SELECT 'executive'::text     AS old_role, (SELECT id FROM business_roles WHERE name = '役員') AS br_id
  UNION ALL SELECT 'ops_manager',   (SELECT id FROM business_roles WHERE name = '部長')
  UNION ALL SELECT 'manager',       (SELECT id FROM business_roles WHERE name = 'MG')
  UNION ALL SELECT 'store_manager', (SELECT id FROM business_roles WHERE name = '店長')
)
UPDATE employees e
SET business_role_ids = ARRAY[rm.br_id]
FROM role_map rm
WHERE e.role = rm.old_role AND rm.br_id IS NOT NULL;

-- 移行後は NOT NULL 化
ALTER TABLE employees ALTER COLUMN system_permission SET NOT NULL;
