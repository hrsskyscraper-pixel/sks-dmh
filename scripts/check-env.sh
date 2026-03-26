#!/bin/bash
# check-env.sh — Verify account environment before deploy/push commands
# Used by Claude Code PreToolUse hook to block commands under wrong accounts

EXPECTED_GIT_EMAIL="hrs.skyscraper@gmail.com"
EXPECTED_VERCEL_USER="hrsskyscraper-pixel"

errors=()

# Check git config
actual_email=$(git config user.email 2>/dev/null)
if [[ "$actual_email" != "$EXPECTED_GIT_EMAIL" ]]; then
  errors+=("Git email: expected '$EXPECTED_GIT_EMAIL', got '$actual_email'")
fi

# Check Vercel account
vercel_user=$(vercel whoami 2>/dev/null)
if [[ -z "$vercel_user" ]]; then
  errors+=("Vercel: not logged in. Run 'vercel login --github'")
elif [[ "$vercel_user" != *"$EXPECTED_VERCEL_USER"* ]]; then
  errors+=("Vercel: expected '$EXPECTED_VERCEL_USER', got '$vercel_user'")
fi

if [[ ${#errors[@]} -gt 0 ]]; then
  echo '{"continue": false, "stopReason": "ACCOUNT MISMATCH DETECTED:\n'"$(printf '%s\\n' "${errors[@]}")"'\n\nFix accounts before deploying."}'
  exit 0
fi

echo '{"continue": true}'
