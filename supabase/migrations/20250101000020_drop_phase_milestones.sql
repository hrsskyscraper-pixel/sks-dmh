-- 019_drop_phase_milestones.sql
-- phase_milestones テーブルの廃止
-- 実行前提: 017_skill_projects.sql と 018_migrate_to_projects.sql が適用済みであること
-- project_phases にデータが移行済みであることを確認してから実行すること

DROP TABLE IF EXISTS phase_milestones;
