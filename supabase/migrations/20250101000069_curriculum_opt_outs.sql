-- =============================================
-- 069_curriculum_opt_outs.sql
-- 担当リーダーが「このカリキュラムでは育成対象として参加しない（＝各種ランキングに表示しない）」を
-- 育成カリキュラムごとに選択できるようにする。
--   - 行が存在する  = しない（ランキング集計から除外）
--   - 行が無い      = する（デフォルト）
-- 影響範囲はランキング集計のみ。本人のスキル申請・閲覧は従来どおり可能。
-- =============================================

CREATE TABLE IF NOT EXISTS curriculum_opt_outs (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES skill_projects(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES employees(id),
  PRIMARY KEY (employee_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_opt_outs_project ON curriculum_opt_outs (project_id);

ALTER TABLE curriculum_opt_outs ENABLE ROW LEVEL SECURITY;

-- 読み取りは自分の行のみ（ランキング集計・設定UIは admin client(service role) 経由で読むため、これで十分）
CREATE POLICY curriculum_opt_outs_select_own ON curriculum_opt_outs
  FOR SELECT TO authenticated
  USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

-- 書き込みは admin client(service role) 経由のみ（権限チェック後にサーバーアクションで実施）。
-- authenticated 向けの insert/update/delete ポリシーは作らない。
