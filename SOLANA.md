# Velfi on Solana: build, deploy and run (devnet)

> **Launching on mainnet? Read [MAINNET.md](MAINNET.md).** Mainnet v1 runs in *lite mode* (no custom program, nothing to deploy). This file covers the full program, which turns on when `VELFI_PROGRAM_ID` is set, after an audit.

This branch moves Velfi from Sui to Solana. It has three parts:

- `solana/`: the on-chain program (Anchor). Guardrail mandates (Autopilot budgets), claim-link escrow (send to an email), streams, split streams, SafePay and staged pay.
- `backend/`: the API now talks to Solana. Users sign with their own Google wallet (Privy). Velfi only pays the network fee.
- `frontend/`: Google sign-in through Privy, a "slide to approve" that asks your wallet to sign, and Claim, Stop and Cancel buttons on Flows.

## What changed, in plain words

- **Truly non-custodial.** On Sui, Velfi's agent wallet paid every send, stream and schedule from its own balance. Now every payment comes from the user's wallet and needs their signature.
- **Gasless.** Velfi co-signs as fee payer, so users don't need SOL to move USDC.
- **Autopilot inside hard limits.** A recurring payment locks exactly *count × amount* in an on-chain mandate. That mandate can only pay that one recipient, at most that amount per payment, until it expires. The user can cancel it anytime and get the rest back.
- **Streams live on-chain.** Money vests every second and the recipient claims whenever they like. Stopping a stream pays out what has vested and refunds the rest.
- **Send to an email.** The money waits in an on-chain escrow. It lands in the person's wallet automatically when they sign up, or the sender can take it back after 7 days.
- **Bugs fixed while porting:**
  - Sui split streams could never be stopped. Any remainder from an uneven split was locked forever.
  - The escrow claim secret was visible in the transaction, so anyone watching could copy and front-run a claim.
  - `/auth/register` let anyone rename anyone's username.
  - `/agent/approve` and `/agent/revise` crashed on undefined variables.
  - The low-confidence double-check never ran.
  - The USD price fallback could guess volatile prices.

## 1. Install the tools (once)

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
# restart the terminal, then:
avm install 0.31.1 && avm use 0.31.1
solana config set --url devnet
solana-keygen new            # skip if you already have ~/.config/solana/id.json
solana airdrop 2             # or use https://faucet.solana.com
```

## 2. Build and test the program

```bash
cd solana
cargo test -p velfi-core     # the money rules: 50 tests, no chain needed
yarn install                 # or npm install
anchor keys sync             # writes YOUR program ID into lib.rs and Anchor.toml
anchor build
anchor test                  # spins up a local validator and runs tests/velfi.ts
```

## 3. Deploy to devnet

```bash
anchor deploy --provider.cluster devnet
# copy the Program Id it prints into backend/.env as VELFI_PROGRAM_ID
```

## 4. Velfi's server keys

```bash
solana-keygen new -o ~/velfi-fee-payer.json --no-bip39-passphrase
solana-keygen new -o ~/velfi-agent.json --no-bip39-passphrase
solana airdrop 2 $(solana-keygen pubkey ~/velfi-fee-payer.json)
```

Paste the contents of each file (the `[12,34,...]` array) into `VELFI_FEE_PAYER_KEY` and `VELFI_AGENT_KEY` in `backend/.env`.

## 5. Supabase

Open the SQL editor and run `backend/sql/001_solana.sql`. It only adds things; nothing existing is removed.

## 6. Privy (Google sign-in plus a Solana wallet)

1. Create an app at https://dashboard.privy.io.
2. Login methods: turn on **Google** only.
3. Embedded wallets: turn on **Solana**, set to create on login.
4. Allowed origins: add `http://localhost:5173` and your app's domain.
5. Copy the App ID into `frontend/.env` (`VITE_PRIVY_APP_ID`). Copy the App ID and App Secret into `backend/.env`.

## 7. Run it

```bash
cd backend && cp .env.example .env   # fill it in
npm install && npm test && npm start

cd ../frontend && cp .env.example .env
npm install && npm run dev
```

## 8. Try it on devnet

1. Sign in with Google and claim a `.vel` name.
2. Open Receive and copy your wallet address. Get devnet USDC at https://faucet.circle.com (choose Solana Devnet).
3. In chat, try each of these:
   - `send 1 USDC to <friend>.vel`
   - `stream 10 USDC to <friend>.vel over 10 minutes`
   - `pay <friend>.vel 2 USDC weekly for 3 weeks`
4. To watch schedules run quickly, set `SCHEDULE_DEMO_SECS=60` in `backend/.env`.

## Tests and where they run

| What | Command | Count |
|---|---|---|
| Money rules (Rust, every Sui test case ported, plus conservation checks) | `cd solana && cargo test -p velfi-core` | 50 |
| Program end to end on a local validator | `cd solana && anchor test` | 8 flows |
| JS client vs the Rust source (account order, args, layouts), amounts, planning, lite-mode rules, start-up checks | `cd backend && npm test` | 53 |
| API routes and chat pipeline with fake chain, DB and AI (program mode and lite mode) | included in `npm test` | 34 |

## Before mainnet (not today)

- **A security audit of `solana/programs/velfi`.** It holds user funds.
- Move to `SOLANA_CLUSTER=mainnet-beta` with real USDC and a paid RPC, and keep the fee payer topped up.
- A monitoring alert when the fee payer's SOL runs low.
- Limits to know about:
  - Up to 5 recipients per payment, because of Solana's transaction size.
  - Streams and schedules use USDC, not native SOL.
  - Swaps (through Jupiter) are mainnet-only.
- The app pins Privy's React SDK to 2.x. All Privy-specific code is in `frontend/src/hooks/useVelfiWallet.js` and `useVelfiSignIn.js`, so an upgrade only touches those two files.
