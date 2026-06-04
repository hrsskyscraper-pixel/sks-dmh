-- 共通1リンク（自己選択型）の招待リンク
-- 参加者がリンクを開き、自分の所属（店舗/部署/チーム）を選んで参加する方式。
-- 1本のリンクをグループLINE等に一斉投稿し、各自が自店舗を選んでリーダー/メンバー参加できる。
--
-- - team_id: 自己選択型では参加先が固定でないため NULL を許容する
-- - is_self_select: 自己選択型リンクか
-- - allowed_team_types: 参加時に選べるチーム種別（NULL = 全種別 store/department/project）
-- - revoked_at: 管理者による手動無効化（リンクを即時失効させる）
--
-- 自己選択型リンクは再利用可能とする（受諾しても used_at で消費しない）。

ALTER TABLE team_invitations ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE team_invitations ADD COLUMN is_self_select boolean NOT NULL DEFAULT false;
ALTER TABLE team_invitations ADD COLUMN allowed_team_types text[];
ALTER TABLE team_invitations ADD COLUMN revoked_at timestamptz;
