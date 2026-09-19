-- =============================================
-- スキルのマイルストーン（級・全体ゴール）と社内資格の自動登録
-- =============================================
-- 2026-09-19 MTG 決定:
--   - 「調理3級まであと○項目」= 同じ区分（カテゴリ）で、カリキュラム上その行より手前に並ぶ未認定スキルの数
--   - 「新卒運営」はカリキュラム全体のゴール（全区分の未認定スキルを数える）
--   - 認定の操作はこれまで通り挟む（級の行が認定された時点で到達）
--   - 級の行が認定されたら Myキャリアの社内資格に自動登録（プレ審査・研修卒業テスト・新卒運営は資格なし）
--
-- milestone_kind : 'grade' = 級（区分内の手前を数える） / 'goal' = 全体ゴール / NULL = 通常スキル
-- milestone_cert : 認定時に自動登録する社内資格名（certifications.name と対応。NULL なら到達表示のみ）
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS milestone_kind TEXT
    CHECK (milestone_kind IN ('grade', 'goal')),
  ADD COLUMN IF NOT EXISTS milestone_cert TEXT;

COMMENT ON COLUMN public.skills.milestone_kind IS '級（grade: 同区分の手前を数える）／全体ゴール（goal）／NULL=通常';
COMMENT ON COLUMN public.skills.milestone_cert IS '認定時に自動登録する社内資格名（certifications.name）。NULL は到達表示のみ';

-- ---------- ライジング_CoCo壱_v1.0 の初期設定（できました表 新卒 が元） ----------
-- カリキュラムに紐づくスキルだけを名前で更新する（他カリキュラムの同名スキルは触らない）。冪等。
WITH target AS (
  SELECT ps.skill_id
  FROM public.project_skills ps
  JOIN public.skill_projects p ON p.id = ps.project_id
  WHERE p.name = 'ライジング_CoCo壱_v1.0'
)
UPDATE public.skills s
SET milestone_kind = v.kind,
    milestone_cert = v.cert
FROM (VALUES
  ('研修卒業テスト', 'grade', NULL),
  ('接客３級取得',   'grade', '接客３級'),
  ('接客２級',       'grade', '接客２級'),
  ('調理3級',        'grade', '調理３級'),
  ('プレ審査',       'grade', NULL),
  ('調理2級',        'grade', '調理２級'),
  ('新卒運営',       'goal',  NULL)
) AS v(name, kind, cert)
WHERE s.name = v.name
  AND s.id IN (SELECT skill_id FROM target);
