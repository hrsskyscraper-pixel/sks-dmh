-- 級の取得のお知らせ（見たい店舗の選択）と、時給アップの演出（2026-10-22 原島さん確定 A-5）
--
-- store_follows: ご本人が選ぶ「級の取得を知らせてほしい店舗」。
--   mode = 'follow' … 所属していない店舗も知らせてもらう
--   mode = 'mute'   … 自分の所属店舗でも知らせない
--   所属店舗は行が無ければ知らせる（既定でオン）。
-- 通知は LINE（無料枠の月200通の手前で自動停止）。アプリ内は従来どおり、級合格のお知らせが全員に出る。
CREATE TABLE IF NOT EXISTS public.store_follows (
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('follow', 'mute')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_store_follows_team ON public.store_follows (team_id);
ALTER TABLE public.store_follows ENABLE ROW LEVEL SECURITY;
-- admin client（service_role）だけから使う。anon / authenticated には権限を付けない
GRANT ALL ON public.store_follows TO service_role;

-- 級ごとの「上がる金額」（ココスペシャリスト昇給手当。基本給に足した額ではなく、上がる分だけ）。
-- キーは社内資格の名前（certifications.name）。設定画面から変えられる。メイトさんご本人にだけ出す。
INSERT INTO public.app_settings (key, value)
VALUES ('grade_wage_ups', '{"調理１級": 120, "調理２級": 100, "調理３級": 20, "接客１級": 70, "接客２級": 20, "接客３級": 10}'::jsonb)
ON CONFLICT (key) DO NOTHING;
