#!/usr/bin/env bash
# Publish, swap or clear the $VELFI address on the live site. No redeploy.
#   ./scripts/swap-ca.sh <0x address>       set it (the site checks it on-chain)
#   ./scripts/swap-ca.sh clear              back to "Coming soon"
#   ./scripts/swap-ca.sh test               rehearse the live box with USDT (TEST badge)
#   ./scripts/swap-ca.sh                    just show what the site says now
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.swap ] || { echo "✗ No .env.swap. Run: bash scripts/ca-keys.sh"; exit 1; }
SITE="$(grep '^SITE=' .env.swap | cut -d= -f2-)"
ADMIN="$(grep '^ADMIN_KEY=' .env.swap | cut -d= -f2-)"
EP="$SITE/api/token-config"

if [ $# -gt 0 ]; then
  if [ "$1" = clear ]; then BODY='{"address":null}'
  elif [ "$1" = test ]; then BODY='{"test":true}'
  elif [[ "$1" =~ ^0x[0-9a-fA-F]{40}$ ]]; then BODY="{\"address\":\"$1\"}"
  else echo "✗ \"$1\" isn't a BNB Chain address (0x + 40 hex characters)"; exit 1; fi
  echo "→ $( [ "$1" = clear ] && echo clearing || { [ "$1" = test ] && echo 'test mode (USDT, TEST badge)' || echo "setting $1"; } )"
  curl -sS -X POST "$EP" -H "x-admin-key: $ADMIN" -H 'content-type: application/json' -d "$BODY"; echo
fi

echo "← the site now says:"
curl -sS "$EP?t=$(date +%s)"; echo
CC="$(curl -sI "$EP" | tr -d '\r' | grep -i '^cache-control' || true)"
echo "   $CC"
[[ "$CC" == *no-store* ]] || echo "⚠ cache-control has no no-store: the route isn't deployed or something caches it. Run vercel --prod in landing."
