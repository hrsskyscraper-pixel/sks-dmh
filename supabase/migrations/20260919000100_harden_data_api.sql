-- =============================================
-- Data API の権限を引き締める（本番・ステージング共通）
-- =============================================
-- 狙い（2026-09-19 原島さんMTG後の方針）:
--   1) 既存テーブル: これまで通り anon / authenticated / service_role が API から扱える（RLS が門番）。
--      本番では既に付与済みなので no-op。ステージング（「Automatically expose new tables」オフで作成）
--      では既定の権限が無いため、ここで付け直す。
--   2) 今後作るテーブル・関数・シーケンス:
--      - service_role（サーバー内部の管理クライアント）には自動で権限を付ける
--        → マイグレーションに GRANT を書き忘れても本番の admin client が止まらない
--      - anon / authenticated には自動では付けない
--        → ポリシーと GRANT を明示するまで、新しいテーブルは公開 API から見えない（誤公開の防止）
--   3) 新しいテーブルには自動で RLS を有効にするイベントトリガーを置く（Supabase の
--      「Enable automatic RLS」と同じ関数・同じトリガー名。既にあれば何もしない）。
--
-- 運用ルール（CLAUDE.md にも記載）:
--   新しいテーブル／RPC 関数を authenticated（ブラウザ・RLS 尊重クライアント）から使う場合は、
--   マイグレーションで  GRANT SELECT[, INSERT, UPDATE, DELETE] ON public.<table> TO authenticated;
--   （関数は GRANT EXECUTE ON FUNCTION ... TO authenticated;）を必ず書く。

-- ---------- 1) 既存オブジェクトの権限（本番: no-op / ステージング: 復元） ----------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ---------- 2) 既定の権限（マイグレーションは postgres ロールで実行される） ----------
-- service_role: 自動付与を維持
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- anon / authenticated: 自動付与をやめる（新規オブジェクトは明示 GRANT が必要）
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ---------- 3) 新規テーブルに RLS を自動で有効化（Supabase ダッシュボードと同じ実装） ----------
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- イベントトリガー関数は API から呼べる必要がない
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, service_role, PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    BEGIN
      CREATE EVENT TRIGGER ensure_rls
        ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        EXECUTE FUNCTION public.rls_auto_enable();
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'ensure_rls: 権限不足のためイベントトリガーを作成できませんでした。ダッシュボードで「Enable automatic RLS」を有効にしてください';
    END;
  END IF;
END $$;
