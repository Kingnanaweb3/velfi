#!/usr/bin/env bash
# Pulls every Velfi GitBook page into public/docs-content/*.md
# Run from ~/velfi/landing:  bash pull-docs.sh
set -e
BASE="https://kinnahjoshua67s-organization.gitbook.io/velfi"
OUT="public/docs-content"

PAGES="readme
getting-started/what-is-velfi
getting-started/sign-in
getting-started/claim-your-name
overview/how-it-works
overview/payment-types
guides/sending-money
guides/splitting-payments
guides/streaming-salaries
guides/escrow
guides/email-to-claim
guides/automations
security/non-custodial
security/zklogin
for-developers/overview
for-developers/architecture
for-developers/sdk
more/faq"

for p in $PAGES; do
  name="$p"; [ "$p" = "readme" ] && name="index"
  mkdir -p "$OUT/$(dirname "$name")"
  # strip GitBook's header note and the "Agent Instructions" footer
  curl -fsSL "$BASE/$p.md" \
    | perl -0pe 's/\A>[^\n]*\n\n//; s/\n---\n+# Agent Instructions.*\z/\n/s' \
    > "$OUT/$name.md"
  echo "✓ $name"
done
echo "Done: $(ls -R "$OUT" | grep -c '\.md$') pages in $OUT"
