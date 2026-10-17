#!/usr/bin/env bash
# One-time setup for the live $VELFI address on velfi.xyz.
# Asks for your Upstash keys and a Helius URL, tests them, saves them to
# landing/.env.swap (gitignored) and adds them to the Vercel "velfi" project
# without quotes. Run from anywhere:  bash ~/velfi/landing/scripts/ca-keys.sh
set -euo pipefail
cd "$(dirname "$0")/.."
command -v vercel >/dev/null || { echo "✗ Vercel CLI not found (npm i -g vercel)"; exit 1; }

ask() { local v; read -r -s -p "$1: " v; echo >&2; printf '%s' "$v" | tr -d "\"' \r\n"; }
echo "Upstash → your database → REST API tab (not the redis:// string)."
URL="$(ask 'UPSTASH_REDIS_REST_URL')"
TOKEN="$(ask 'UPSTASH_REDIS_REST_TOKEN')"
[[ "$URL" == https://* ]] || { echo "✗ The REST URL should start with https://"; exit 1; }
PING="$(curl -sS -X POST "$URL" -H "Authorization: Bearer $TOKEN" -d '["PING"]' || true)"
[[ "$PING" == *PONG* ]] || { echo "✗ Upstash didn't answer PONG. Check the URL and token. ($PING)"; exit 1; }
echo "✓ Upstash works"

echo "Solana RPC for the on-chain check. Use a Helius mainnet URL (it can read token symbols)."
RPC="$(ask 'SOLANA_RPC_URL')"
OK="$(curl -sS -X POST "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' || true)"
[[ "$OK" == *'"ok"'* ]] || { echo "✗ That RPC didn't answer ok. ($OK)"; exit 1; }
echo "✓ RPC works"

if [ -f .env.swap ] && grep -q '^ADMIN_KEY=' .env.swap; then ADMIN="$(grep '^ADMIN_KEY=' .env.swap | cut -d= -f2-)"
else ADMIN="$(openssl rand -hex 32)"; fi

umask 077
cat > .env.swap <<ENV
SITE=https://velfi.xyz
ADMIN_KEY=$ADMIN
UPSTASH_REDIS_REST_URL=$URL
UPSTASH_REDIS_REST_TOKEN=$TOKEN
SOLANA_RPC_URL=$RPC
EXPECTED_SYMBOL=VELFI
ENV
echo "✓ Saved landing/.env.swap (keep it private; it's gitignored)"

vercel link --project velfi --yes >/dev/null
put() { vercel env rm "$1" production -y >/dev/null 2>&1 || true; printf '%s' "$2" | vercel env add "$1" production >/dev/null; echo "  • $1"; }
echo "Adding to Vercel (project velfi, Production):"
put UPSTASH_REDIS_REST_URL "$URL"
put UPSTASH_REDIS_REST_TOKEN "$TOKEN"
put ADMIN_KEY "$ADMIN"
put SOLANA_RPC_URL "$RPC"
put EXPECTED_SYMBOL "VELFI"
echo "✓ Done. Next: cd ~/velfi/landing && vercel --prod"
