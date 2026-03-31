-- 社内資格マスタ
CREATE TABLE certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certifications_select" ON certifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "certifications_admin" ON certifications FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('admin','ops_manager','executive'))
);
