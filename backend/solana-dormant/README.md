# Solana (dormant)

Velfi runs on BNB Chain now. These files are the Solana-only parts of the
backend, kept here unused so nothing imports them by accident:

- `lib/solana.js`: Solana connection, fee payer co-signing, sending
- `lib/jupiter.js`: Jupiter swaps
- `test/`: the Solana route tests

They are not complete on their own. The full working Solana version (backend,
app and site, exactly as it ran on mainnet) is the git tag `solana-v1`:

```bash
git checkout solana-v1        # look at it, or deploy from it
git checkout -b solana-again solana-v1   # to work on it again
```

The Solana program source is in `/solana` and its docs in `/docs/solana`.
The database is shared: Solana rows have `chain = 'solana'` and the BNB backend
never touches them (see `backend/sql/003_bnb.sql`).
