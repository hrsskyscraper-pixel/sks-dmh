#!/bin/bash
# check-env.sh — Verify account environment before deploy/push commands
# Used by Claude Code PreToolUse hook to block commands under wrong accounts

EXPECTED_GIT_EMAIL="hrs.skyscraper@gmail.com"
EXPECTED_VERCEL_USER="hrsskyscraper-pixel"

# プロジェクト切替方式（~/.config/account-tokens.env）に対応:
# このスクリプトは Claude Code の PreToolUse フックから呼ばれるため、
# 親シェルで export した VERCEL_TOKEN は伝わらない。SKS 専用トークンを
# 直接 source して `vercel whoami` に効かせる。
TOKENS_ENV="$HOME/.config/account-tokens.env"
if [ -f "$TOKENS_ENV" ]; then
  # shellcheck disable=SC1090
  source "$TOKENS_ENV"
  if [ -n "${VERCEL_TOKEN_SKS:-}" ]; then
    export VERCEL_TOKEN="$VERCEL_TOKEN_SKS"
  fi
fi

errors=()

# Check git config
actual_email=$(git config user.email 2>/dev/null)
if [[ "$actual_email" != "$EXPECTED_GIT_EMAIL" ]]; then
  errors+=("Git email: expected '$EXPECTED_GIT_EMAIL', got '$actual_email'")
fi

# Check Vercel account（VERCEL_TOKEN が export されていればそれを参照）
vercel_user=$(vercel whoami 2>/dev/null | tail -1 | xargs)
if [[ -z "$vercel_user" ]]; then
  errors+=("Vercel: not logged in. Set VERCEL_TOKEN_SKS in ~/.config/account-tokens.env")
elif [[ "$vercel_user" != *"$EXPECTED_VERCEL_USER"* ]]; then
  errors+=("Vercel: expected '$EXPECTED_VERCEL_USER', got '$vercel_user'")
fi

if [[ ${#errors[@]} -gt 0 ]]; then
  echo '{"continue": false, "stopReason": "ACCOUNT MISMATCH DETECTED:\n'"$(printf '%s\\n' "${errors[@]}")"'\n\nFix accounts before deploying."}'
  exit 0
fi

echo '{"continue": true}'
