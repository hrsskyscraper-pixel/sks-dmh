#!/usr/bin/env bash
# ==================================================================
# Supabase バックアップ復元スクリプト
#
# 使い方:
#   1. バックアップ用リポジトリから .dump.enc ファイルをダウンロード
#   2. このスクリプトを実行
#
#   ./scripts/restore-backup.sh <暗号化ダンプファイル> <復元先DATABASE_URL>
#
# 例:
#   ./scripts/restore-backup.sh db-20260414-030000.dump.enc \
#     "postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres"
#
# ⚠️ 警告:
#   - 復元先DBの public スキーマが上書きされます
#   - 事前に必ずテスト環境で試してください
#   - auth スキーマは復元されません（ユーザーは再ログイン必要）
# ==================================================================

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <encrypted-dump-file> <DATABASE_URL>"
  echo ""
  echo "Example:"
  echo "  $0 db-20260414-030000.dump.enc 'postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres'"
  exit 1
fi

ENC_FILE="$1"
TARGET_DB="$2"

if [ ! -f "$ENC_FILE" ]; then
  echo "❌ ファイルが見つかりません: $ENC_FILE"
  exit 1
fi

# 1. 復号
echo "🔓 ダンプを復号しています..."
read -rsp "バックアップ パスフレーズ: " PASSPHRASE
echo
DECRYPTED="${ENC_FILE%.enc}"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d \
  -in "$ENC_FILE" \
  -out "$DECRYPTED" \
  -pass "pass:$PASSPHRASE"
unset PASSPHRASE
echo "✅ 復号完了: $DECRYPTED"

# 2. 接続確認
echo ""
echo "🔌 接続先DBを確認します..."
psql "$TARGET_DB" -c "SELECT current_database(), current_user, version();" || {
  echo "❌ DBに接続できません"
  rm -f "$DECRYPTED"
  exit 1
}

# 3. 最終確認
echo ""
echo "⚠️  以下のDBの public スキーマを復元します:"
echo "   $TARGET_DB" | sed 's/:[^:@]*@/:*****@/'
read -rp "本当に実行しますか？ yes と入力してください: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "キャンセルしました"
  rm -f "$DECRYPTED"
  exit 0
fi

# 4. 復元
echo ""
echo "♻️  復元中..."
pg_restore \
  --verbose \
  --no-owner --no-privileges \
  --clean --if-exists \
  --dbname="$TARGET_DB" \
  "$DECRYPTED"

# 5. クリーンアップ
rm -f "$DECRYPTED"

echo ""
echo "✅ 復元完了"
echo ""
echo "📝 次にやるべきこと:"
echo "  1. アプリを開いて動作確認"
echo "  2. ユーザーは一度サインアウトし、再ログインが必要（auth は復元されないため）"
echo "  3. Supabase ダッシュボードで RLS ポリシーが正常か確認"
