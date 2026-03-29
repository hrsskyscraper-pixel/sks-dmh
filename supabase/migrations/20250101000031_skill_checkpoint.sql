-- スキルのチェックポイントフラグ
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_checkpoint BOOLEAN NOT NULL DEFAULT false;
