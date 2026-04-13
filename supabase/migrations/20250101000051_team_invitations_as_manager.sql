-- チーム招待にリーダー区分を追加
-- true: リーダー（副）として加入 / false: メンバーとして加入
ALTER TABLE team_invitations
  ADD COLUMN as_manager boolean NOT NULL DEFAULT false;
