#!/bin/bash
# ==================================================================
# ステージング DB を「本番の最新バックアップ（マスク済み）」で作り直す
#
#   scripts/staging-refresh.sh            # 最新のダンプで作り直す
#   scripts/staging-refresh.sh db-20260919-202746.dump.enc   # 特定のダンプ
#
# これは同時に「バックアップの復元テスト」でもある（docs/BACKUP.md の
# scripts/restore-backup.sh をそのまま使い、その上でアプリが動くところまで確かめる）。
#
# 流れ:
#   1. 非公開リポジトリ sks-dmh-backups から暗号化ダンプを取得（gh）
#   2. 復号（パスフレーズを対話入力。値はどこにも残さない）→ ステージングへ復元
#      （scripts/restore-backup.sh。public スキーマを丸ごと置き換える）
#   3. Data API の権限・既定権限・RLS 自動有効化を付け直す（ダンプは権限を含まない）
#   4. マスク: 運営チームとテストアカウント以外のメールを example 宛てに置換、
#      LINE ID・生年月日・SNS を空に（scripts/staging-refresh-post.sql）
#   5. Google ログイン時にメールで社員行を自動で紐づけるトリガ（ステージング限定。
#      auth スキーマは復元されないため）
#   6. 本番に未適用のマイグレーションを、ステージングの履歴から外して当て直す
#      （本番の `sb migration list --linked` を正として判定）
#
# 前提: gh（hrsskyscraper-pixel でログイン）、psql / pg_restore 17、supabase CLI、
#       ~/.config/account-tokens.env に SUPABASE_DB_PASSWORD_SKS_STAGING と SUPABASE_TOKEN_SKS
#       （本番の適用状況の確認用。値は表示しない）。
#
# 追加で本物のメールを残したい人がいれば、実行前に環境変数で:
#   STAGING_KEEP_EMAILS="a@example.com,b@example.com" scripts/staging-refresh.sh
# （運用管理者・開発者・役員・テストアカウントは指定しなくても残る）
# ==================================================================
set -o pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVFILE="${ACCOUNT_TOKENS_ENV:-$HOME/.config/account-tokens.env}"
MASK="$HOME/ClaudeCode/management/00_context/account_registry/switcher/bin/mask-secrets"
[ -x "$MASK" ] || MASK=cat
REF="giwqelfbvsgucpnzzdao"
HOST="aws-0-ap-northeast-1.pooler.supabase.com"
PORT=5432
BACKUP_REPO="hrsskyscraper-pixel/sks-dmh-backups"
WORK="${TMPDIR:-/tmp}/sks-dmh-staging-refresh"

# shellcheck disable=SC1090
source "$ENVFILE"
PW="${SUPABASE_DB_PASSWORD_SKS_STAGING:-}"
if [ -z "$PW" ]; then
  echo "staging-refresh: SUPABASE_DB_PASSWORD_SKS_STAGING が $ENVFILE にありません" >&2
  exit 1
fi
ENC=$(P="$PW" python3 -c 'import urllib.parse,os;print(urllib.parse.quote(os.environ["P"], safe=""))')
URL="postgresql://postgres.${REF}:${ENC}@${HOST}:${PORT}/postgres"
unset PW ENC

for cmd in gh psql pg_restore supabase openssl python3; do
  command -v "$cmd" >/dev/null || { echo "staging-refresh: $cmd が見つかりません" >&2; exit 1; }
done

psqlS() { command psql "$URL" -v ON_ERROR_STOP=1 -X "$@" 2>&1 | "$MASK"; return "${PIPESTATUS[0]}"; }

# ---------- 0. 接続先の取り違え防止 ----------
echo "▶ 接続先の確認（ステージング $REF）"
psqlS -At -c "select current_database() || ' / employees=' || (select count(*) from public.employees)" || {
  echo "staging-refresh: ステージングに接続できません" >&2; exit 1; }

# ---------- 1. ダンプ取得 ----------
mkdir -p "$WORK"
if [ -n "${1:-}" ]; then
  NAME="$(basename "$1")"
else
  NAME=$(gh api "repos/$BACKUP_REPO/contents/daily" \
    --jq '[.[].name | select(startswith("db-") and endswith(".dump.enc"))] | sort | last')
fi
[ -n "$NAME" ] || { echo "staging-refresh: ダンプが見つかりません" >&2; exit 1; }
if [ -f "$1" ] 2>/dev/null; then
  cp "$1" "$WORK/$NAME"
else
  echo "▶ ダンプを取得: $NAME"
  gh api -H "Accept: application/vnd.github.raw" "repos/$BACKUP_REPO/contents/daily/$NAME" > "$WORK/$NAME" || {
    echo "staging-refresh: ダンプの取得に失敗しました" >&2; exit 1; }
fi
ls -la "$WORK/$NAME"

# ---------- 2. 復元（手順書のスクリプト。パスフレーズと yes を聞かれる） ----------
# ensure_rls イベントトリガーは復元対象の関数に依存しており、--clean の DROP が失敗するので先に外す（後で付け直す）
psqlS -c "drop event trigger if exists ensure_rls" >/dev/null
echo "▶ 復元（scripts/restore-backup.sh）"
"$ROOT/scripts/restore-backup.sh" "$WORK/$NAME" "$URL" 2>&1 | "$MASK"
RC=${PIPESTATUS[0]}
rm -f "$WORK/$NAME" "$WORK/${NAME%.enc}"
if [ "$RC" -ne 0 ]; then
  echo "staging-refresh: 復元が完了しませんでした（終了コード $RC）。ステージングは中途半端な状態の可能性があります" >&2
  exit "$RC"
fi

# ---------- 3. 権限・既定権限・RLS 自動有効化（ダンプは --no-privileges） ----------
echo "▶ Data API の権限を付け直す"
psqlS -q -f "$ROOT/supabase/migrations/20260919000100_harden_data_api.sql" || exit 1

# ---------- 4〜5. マスク＋ログイン紐づけトリガ ----------
echo "▶ マスクとログイン紐づけ"
psqlS -q -v keep="${STAGING_KEEP_EMAILS:-}" -f "$ROOT/scripts/staging-refresh-post.sql" || exit 1

# ---------- 6. 本番に未適用のマイグレーションを当て直す ----------
echo "▶ 本番のマイグレーション状況を確認（supabase migration list --linked）"
# sb ラッパーと同じ方式でトークンを注入する（PATH に sb が無い端末でも動くように）。値は表示しない
PROD_TOKEN="${SUPABASE_TOKEN_SKS:-}"
if [ -z "$PROD_TOKEN" ]; then
  echo "staging-refresh: SUPABASE_TOKEN_SKS が $ENVFILE にありません（本番の適用状況を確認できないため中断）" >&2
  exit 1
fi
LIST=$(cd "$ROOT" && SUPABASE_ACCESS_TOKEN="$PROD_TOKEN" command supabase migration list --linked 2>&1 | grep -v "new version\|recommend")
unset PROD_TOKEN
# 出力は表形式（LOCAL │ REMOTE │ TIME）または JSON（フックで整形された場合）のどちらか。REMOTE が空の行＝本番に未適用
PENDING=$(printf '%s\n' "$LIST" | python3 -c '
import sys, re, json
txt = sys.stdin.read()
m = re.search(r"\{\"migrations\":.*\}", txt)
if m:
    for r in json.loads(m.group(0))["migrations"]:
        if r.get("local") and not r.get("remote"): print(r["local"])
else:
    for line in txt.splitlines():
        mm = re.match(r"^\s*(\d{14})\s*[|│]\s*[|│]", line)
        if mm: print(mm.group(1))
')
# 判定できなかった（一覧に 14 桁の version が 1 つも無い）ときは、黙って進めずに止める。
# 進めると「履歴は適用済みなのに列が無い」状態になり、画面でスキルが 0 件になる（2026-09-20 に実際に発生）
if ! printf '%s\n' "$LIST" | grep -qE '[0-9]{14}'; then
  echo "staging-refresh: 本番のマイグレーション一覧を取得できませんでした。出力:" >&2
  printf '%s\n' "$LIST" | "$MASK" | head -20 >&2
  echo "  復元・マスクは済んでいます。本番に未適用の version を確認して、手動で当ててください:" >&2
  echo "  scripts/staging-db.sh psql -c \"delete from supabase_migrations.schema_migrations where version in ('<v1>','<v2>')\" && scripts/staging-db.sh db push" >&2
  exit 1
fi
if [ -z "$PENDING" ]; then
  echo "  本番に未適用のマイグレーションはありません"
else
  echo "  本番に未適用: $(echo "$PENDING" | tr '\n' ' ')"
  IN=$(echo "$PENDING" | sed "s/.*/'&'/" | paste -sd, -)
  psqlS -q -c "delete from supabase_migrations.schema_migrations where version in ($IN)" || exit 1
  (cd "$ROOT" && command supabase db push --db-url "$URL" 2>&1 | grep -vE "new version|recommend updating" | "$MASK")
  RC=${PIPESTATUS[0]}
  [ "$RC" -eq 0 ] || { echo "staging-refresh: db push に失敗しました" >&2; exit "$RC"; }
fi

# ---------- 結果 ----------
echo "▶ 結果"
psqlS -At -c "
select 'employees=' || (select count(*) from public.employees)
    || ' masked=' || (select count(*) from public.employees where email like '%@staging.invalid')
    || ' kept=' || (select count(*) from public.employees where email not like '%@staging.invalid')
    || ' achievements=' || (select count(*) from public.achievements)
    || ' skill_projects=' || (select count(*) from public.skill_projects)
    || ' migrations=' || (select count(*) from supabase_migrations.schema_migrations)"
echo "  本物のメールを残した人:"
psqlS -At -c "select '   - ' || name || ' <' || email || '>' from public.employees where email not like '%@staging.invalid' order by name"
echo
echo "✅ 完了。https://sks-dmh-staging.vercel.app にログインして確認してください（初回ログインでメールにより社員行が自動で紐づきます）"
