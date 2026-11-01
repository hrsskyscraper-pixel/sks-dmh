-- 在職者の確認（2026-11-01）。人事の社員リストと MB のアカウントの違いを、1人1行の「変更案」にして、
-- 須貝（下書き）→ 原島さん（概要の確認）→ 店長（問題ない／問題ある）＋原島さん（担当者承認）→
-- 上長（菅原部長・諸沢社長が同時に承認・コメント）＋原島さん（会社として決定）→ 須貝（確認）→ 原島さん（まとめて反映）
-- の順に回す。読み書きはすべてサーバー（admin client）だけ。ブラウザからは触れない。

CREATE TABLE IF NOT EXISTS public.roster_review_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  -- draft: 須貝の下書き ／ ops_preview: 原島さんの確認 ／ store: 店長の確認と担当者承認 ／
  -- senior: 上長の確認と会社としての決定 ／ dev_check: 須貝の確認 ／ apply: 反映待ち ／ done: 反映済み
  stage text NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft', 'ops_preview', 'store', 'senior', 'dev_check', 'apply', 'done')),
  -- 原島さんの確認結果を承認する上長
  senior_ids uuid[] NOT NULL DEFAULT '{}',
  -- 須貝から原島さんへの概要（下書きの段階で書く）
  overview text,
  created_by uuid REFERENCES public.employees(id),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.employees(id),
  decided_at timestamptz,
  applied_by uuid REFERENCES public.employees(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roster_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.roster_review_batches(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  -- 社員リストの行（氏名・ふりがな・社員番号・区分・店舗・役職・確認事項 など。取り込んだときのまま）
  roster jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- つないだ MB のアカウント（MB にいない方は null）
  employee_id uuid REFERENCES public.employees(id),
  -- undecided: まだ決めていない（下書きだけ） ／ none: 変えない ／ change: 区分・役職・店舗を変える ／
  -- stop: アカウントを止める ／ issue: アカウントを発行する ／ skip: MB は使わない
  action text NOT NULL DEFAULT 'undecided' CHECK (action IN ('undecided', 'none', 'change', 'stop', 'issue', 'skip')),
  target_employment_type text CHECK (target_employment_type IN ('社員', 'メイト')),
  target_team_id uuid REFERENCES public.teams(id),
  target_role_ids uuid[],
  stop_reason text CHECK (stop_reason IN ('left', 'shared', 'duplicate')),
  -- 確認してもらう店舗（店長に回す）。null か店長のいない店舗は原島さんへ直接
  confirm_team_id uuid REFERENCES public.teams(id),
  -- 須貝のメモ（店長には見せない）
  dev_note text,
  -- 原島さんが概要の確認で分かったこと（その時点で決められた行は store を飛ばす）
  ops_preview_note text,
  skip_store boolean NOT NULL DEFAULT false,
  store_answer text CHECK (store_answer IN ('ok', 'ng')),
  store_message text,
  store_answered_by uuid REFERENCES public.employees(id),
  store_answered_at timestamptz,
  ops_approved boolean NOT NULL DEFAULT false,
  ops_note text,
  ops_by uuid REFERENCES public.employees(id),
  ops_at timestamptz,
  applied_at timestamptz,
  apply_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roster_review_items_batch ON public.roster_review_items(batch_id, seq);
CREATE INDEX IF NOT EXISTS idx_roster_review_items_confirm_team ON public.roster_review_items(confirm_team_id);

-- 上長の承認（1人1行。承認を取り消してコメントだけにもできる）
CREATE TABLE IF NOT EXISTS public.roster_review_signoffs (
  batch_id uuid NOT NULL REFERENCES public.roster_review_batches(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  approved boolean NOT NULL DEFAULT false,
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, employee_id)
);

-- やりとり（全体または1行へのコメント。案を直したときの記録も残す）
CREATE TABLE IF NOT EXISTS public.roster_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.roster_review_batches(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.roster_review_items(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.employees(id),
  stage text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roster_review_comments_batch ON public.roster_review_comments(batch_id, created_at);

ALTER TABLE public.roster_review_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_review_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_review_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roster_review_batches, public.roster_review_items, public.roster_review_signoffs, public.roster_review_comments FROM anon, authenticated;
