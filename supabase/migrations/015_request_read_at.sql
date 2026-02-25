-- =============================================
-- 015_request_read_at.sql  申請の既読管理
-- =============================================
-- 申請者が審査結果（approved/rejected）を確認したかどうかを管理するカラム

ALTER TABLE team_change_requests
  ADD COLUMN applicant_read_at TIMESTAMPTZ DEFAULT NULL;

-- 既存の approved/rejected レコードは既読扱いにしておく（過去分は通知不要）
UPDATE team_change_requests
  SET applicant_read_at = now()
  WHERE status IN ('approved', 'rejected');
