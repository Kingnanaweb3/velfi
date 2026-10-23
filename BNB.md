# Velfi on BNB Chain: set up, test, launch

Velfi runs on BNB Chain (BSC). The Solana version is saved as the git tag
`solana-v1` and its docs are in `docs/solana`. Nothing about it was deleted.

## What changed

- **Wallets.** Google sign-in through Privy now creates an EVM wallet. Each user's
  `.vel` name carries over: the BNB address is saved in a new column
  (`users.evm_address`), and the Solana address stays where it was.
- **Gas.** BNB has no "fee payer" like Solana. Right before a user's payment is
  sent, if their wallet holds less BNB than the network fee, Velfi's **gas
  wallet** sends exactly the missing amount, then sends the payment the user
  signed. Daily caps stop anyone from draining it (see `backend/.env.example`).
- **Several payments, one slide.** A split to 3 people is 3 transactions. The
  user approves them all with one slide; they are sent in order.
- **Schedules.** One ERC-20 allowance for the schedule's total. Velfi's agent pays
  each one on time with `transferFrom`. Cancel sets the allowance back.
- **Email invites.** Same as before: a one-off holding wallet, moved on sign-up or
  back to the sender after 7 days.
- **Tokens.** BNB, USDT and USDC. On BSC, USDT and USDC have 18 decimals. The
  server reads each token's decimals from the chain on start and refuses to run
  on mainnet if one is wrong.
- **Coming soon:** swaps and streams (the Solana program features).
- **Shared database.** Schedules, invites and streams have a `chain` column. The
  BNB server only touches `bnb` rows.

## 1. Database (once)

Supabase, SQL editor: run `backend/sql/003_bnb.sql`. It only adds columns.

## 2. Privy (once)

dashboard.privy.io, your Velfi app: **Embedded wallets** → turn on **EVM /
Ethereum** wallets, created on login. Keep using the same app, so people keep
their accounts and `.vel` names.

## 3. Velfi's two wallets

```bash
cd ~/velfi/backend
npm run new-wallet     # gas wallet  -> VELFI_GAS_KEY
npm run new-wallet     # agent       -> VELFI_AGENT_KEY
```

Only the gas wallet needs BNB. It tops up the agent and the invite wallets
itself. Testnet BNB: https://www.bnbchain.org/en/testnet-faucet

## 4. Testnet

`backend/.env`:

```
BNB_NETWORK=testnet
VELFI_GAS_KEY=0x...
VELFI_AGENT_KEY=0x...
USDC_TOKEN=          # from the next step
```

Testnet has no official USDC, so make a test one and mint some to your app
wallet (sign in to the app once to see your address on the Receive screen):

```bash
node scripts/deploy-test-token.mjs USDC 0xYourAppWalletAddress 1000
```

`frontend/.env`: `VITE_BNB_NETWORK=testnet`

Run the backend (`npm start`) and app (`npm run dev`), then check:

| # | Try | Expect |
|---|---|---|
| 1 | Send 5 USDC to an address, with 0 BNB in your wallet | Lands. BscScan shows a small BNB drop from the gas wallet first |
| 2 | Split 6 USDC between two .vel names | One slide, two transactions |
| 3 | `send 5 USDC weekly to <name>.vel` | First payment right away; Flows shows 1 of 4 |
| 4 | Cancel it in Flows | One more signature; allowance back to 0 |
| 5 | Send 1 USDC to an email that isn't on Velfi | Arrives when they sign up |
| 6 | Open `/health` on the backend | `ok: true` and the gas wallet balance |

## 5. Mainnet

Backend (Railway), environment:

```
BNB_NETWORK=mainnet
BNB_RPC_URL=         # recommended: NodeReal, QuickNode or Ankr BSC endpoint
VELFI_GAS_KEY=0x...  # fund with BNB (0.05 BNB covers thousands of payments)
VELFI_AGENT_KEY=0x...
```

Remove `USDC_TOKEN`, `USDT_TOKEN` and `SCHEDULE_DEMO_SECS`. The server refuses
to start if anything unsafe is set.

App (Vercel): `VITE_BNB_NETWORK=mainnet`, and point the `/api` rewrite in
`frontend/vercel.json` at the BNB backend's URL.

Site (Vercel, project velfi): set `BNB_RPC_URL` for the $VELFI address check,
then publish the token with `./scripts/swap-ca.sh 0x...` as before.

## Switching back to Solana

The Solana deployment is untouched as long as you deploy BNB as a new service
(or keep the old one paused). To go back: redeploy from the tag `solana-v1` and
point the app's `/api` rewrite back. Cancel any active BNB schedules first: the
Solana server does not know about the `chain` column.
