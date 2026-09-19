#!/bin/bash
# ステージング DB（sks-dmh-staging）向け Supabase CLI ラッパー
#
# - 本番のリンク（supabase/.temp）は触らない。--db-url で直接つなぐので、
#   本番とステージングを取り違えない
# - パスワードは ~/.config/account-tokens.env の SUPABASE_DB_PASSWORD_SKS_STAGING から
#   読み、URL エンコードして接続文字列に埋める。値は表示しない
# - 出力は mask-secrets を通す
#
# 使い方:
#   scripts/staging-db.sh migration list
#   scripts/staging-db.sh db push --dry-run
#   scripts/staging-db.sh db push
set -o pipefail
ENVFILE="${ACCOUNT_TOKENS_ENV:-$HOME/.config/account-tokens.env}"
MASK="$HOME/ClaudeCode/management/00_context/account_registry/switcher/bin/mask-secrets"
REF="giwqelfbvsgucpnzzdao"
HOST="aws-0-ap-northeast-1.pooler.supabase.com"   # session mode（マイグレーション用）
PORT=5432

# shellcheck disable=SC1090
source "$ENVFILE"
PW="${SUPABASE_DB_PASSWORD_SKS_STAGING:-}"
if [ -z "$PW" ]; then
  echo "staging-db: SUPABASE_DB_PASSWORD_SKS_STAGING が $ENVFILE にありません" >&2
  exit 1
fi
ENC=$(P="$PW" python3 -c 'import urllib.parse,os;print(urllib.parse.quote(os.environ["P"], safe=""))')
URL="postgresql://postgres.${REF}:${ENC}@${HOST}:${PORT}/postgres"

if [ "$#" -lt 1 ]; then
  echo "usage: scripts/staging-db.sh <supabase subcommand...>   (例: migration list / db push --dry-run)" >&2
  exit 1
fi

# psql モード: scripts/staging-db.sh psql -c "select 1"   （読み取り確認用）
if [ "$1" = "psql" ]; then
  shift
  command psql "$URL" -v ON_ERROR_STOP=1 -X "$@" 2>&1 | "$MASK"
  exit "${PIPESTATUS[0]}"
fi

# サブコマンドの末尾に --db-url を付けて実行（token は不要。DB 直結のため）
command supabase "$@" --db-url "$URL" 2>&1 \
  | grep -vE "A new version of Supabase CLI is available|We recommend updating regularly" \
  | "$MASK"
exit "${PIPESTATUS[0]}"
