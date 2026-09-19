#!/bin/bash
# .env.staging.local の値を Vercel に登録する（値は画面に出さない）
#
# 対象:
#   sks-dmh-staging（Production 環境）: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
#   sks-dmh（本番。keepalive 用）      : STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY（値は上の URL / ANON_KEY と同じ）
#
# 使い方: scripts/staging-env-push.sh
#   前提: プロジェクト直下に .env.staging.local（gitignore 済み）を置き、上記3つを KEY=値 で書いておく
set -o pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVF="$ROOT/.env.staging.local"
MASK="$HOME/ClaudeCode/management/00_context/account_registry/switcher/bin/mask-secrets"
VC="$HOME/ClaudeCode/management/00_context/account_registry/switcher/bin/vc"
TMP="${TMPDIR:-/tmp}/vc-staging"
export VC_ACCOUNT=SKS
export MASK_ENV_FILES="$ENVF"   # mask-secrets がこのファイルの値も伏せる

[ -f "$ENVF" ] || { echo "staging-env-push: $ENVF がありません" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENVF"; set +a
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  [ -n "${!k:-}" ] || { echo "staging-env-push: $ENVF に $k がありません" >&2; exit 1; }
done

# ステージング用プロジェクトに一時ディレクトリでリンク（作業ディレクトリの本番リンクは触らない）
mkdir -p "$TMP"
if [ ! -f "$TMP/.vercel/project.json" ]; then
  "$VC" link --cwd "$TMP" --project sks-dmh-staging --scope hrsskyscraper-pixels-projects --yes >/dev/null 2>&1 || { echo "link failed" >&2; exit 1; }
fi

add() { # add <cwd> <NAME> <value> [--sensitive]
  local cwd="$1" name="$2" val="$3" sens="${4:-}"
  # 既存があれば消してから追加（--force は環境によって効かないため明示的に）
  "$VC" env rm "$name" production --cwd "$cwd" --yes >/dev/null 2>&1 || true
  printf '%s' "$val" | "$VC" env add "$name" production $sens --cwd "$cwd" --yes 2>&1 | "$MASK" | grep -E "Added|Error|error" || true
}

echo "== sks-dmh-staging (production env) =="
add "$TMP" NEXT_PUBLIC_SUPABASE_URL      "$NEXT_PUBLIC_SUPABASE_URL"
add "$TMP" NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
add "$TMP" SUPABASE_SERVICE_ROLE_KEY     "$SUPABASE_SERVICE_ROLE_KEY" --sensitive

echo "== sks-dmh (本番: keepalive 用) =="
add "$ROOT" STAGING_SUPABASE_URL      "$NEXT_PUBLIC_SUPABASE_URL"
add "$ROOT" STAGING_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"

echo "== 登録済み変数名（値は出ない） =="
"$VC" env ls production --cwd "$TMP" 2>&1 | "$MASK" | awk 'NR>2{print "  staging:", $1}' | head -8
