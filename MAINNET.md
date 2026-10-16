# Velfi mainnet launch (lite mode)

Mainnet v1 runs in **lite mode**: no custom on-chain program, nothing to deploy. Velfi uses only Solana's built-in System and Token programs. It turns on by itself when `VELFI_PROGRAM_ID` is left empty.

Work through this file top to bottom. Every box should be ticked before you announce.

## What is live, and what is "coming soon"

| Feature | Mainnet v1 | How it works |
|---|---|---|
| Google sign-in, wallet, .vel names | Live | Privy embedded Solana wallet |
| Send, split, multi-token sends | Live | The user signs; Velfi pays the network fee |
| Scheduled payments (Autopilot) | Live | The user signs one token **allowance** for the schedule's total. Solana caps that total. Velfi's server pays only the chosen person, amount and timetable. Cancel removes the permission. |
| Send to an email | Live (can be switched off) | The money waits in a one-off holding wallet Velfi manages, for up to 7 days. It is swept to the new user on sign-up, or back to the sender automatically. |
| Swaps (Jupiter) | Live | The user pays the small SOL fee for swaps |
| Streams | Coming soon | Chat answers "coming soon" and suggests a schedule |
| Escrow deals, auto-save, invest | Coming soon | Marked "soon" on the site and in the docs |

## What it costs Velfi (your 2.15 SOL)

| Action | Cost to the fee payer | Comes back? |
|---|---|---|
| Any payment, schedule run, cancel | about 0.00001 SOL | No (network fee) |
| First USDC to someone who never held USDC | about 0.00204 SOL | No (their new token account) |
| Email invite holding wallet | about 0.00204 SOL | Yes, when it is swept |
| Deploying anything | 0 | Nothing to deploy |

Suggested split: put **1.5 SOL** in the fee payer and keep **0.65 SOL** in a separate wallet as a top-up reserve. The agent key needs **0 SOL**.

With 1.5 SOL you can cover roughly 700 brand-new recipients, or well over 100,000 ordinary payments. The daily caps below stop anyone from draining it.

---

## 1. Keys (on your own computer, not a server)

- [ ] Create two new keys. **Do not reuse your devnet keys.**
  ```bash
  solana-keygen new -o ~/velfi-mainnet-fee-payer.json --no-bip39-passphrase
  solana-keygen new -o ~/velfi-mainnet-agent.json --no-bip39-passphrase
  solana-keygen pubkey ~/velfi-mainnet-fee-payer.json   # send 1.5 SOL here
  solana-keygen pubkey ~/velfi-mainnet-agent.json       # needs no SOL
  ```
- [ ] Back up both files offline (password manager or encrypted USB). Never commit them, and never paste them in chat.
- [ ] Send 1.5 SOL to the fee payer address. Check it on Solscan.

## 2. RPC

- [ ] Create a Helius (or Triton/QuickNode) mainnet endpoint. Helius's free tier is enough to start. The server refuses to start on mainnet with the public endpoint, because it rate-limits and drops transactions.
- [ ] If you also set `VITE_SOLANA_RPC_URL` for the app, use a **separate key restricted to your domain**, since anything in the frontend is public.

## 3. Supabase

- [ ] In the SQL editor, run `backend/sql/001_solana.sql`, then `backend/sql/002_lite.sql`.
- [ ] Confirm the public anon key can read nothing. This should print `[]` or a permission error, never user data:
  ```bash
  curl "$SUPABASE_URL/rest/v1/users?select=*&limit=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
  ```
  (The landing page's waitlist is untouched and keeps working.)
- [ ] Turn on daily backups (point-in-time recovery if your plan allows it).
- [ ] The service-role key lives only in the backend's environment.

## 4. Privy

- [ ] Use a production Privy app (or switch your app to production).
- [ ] Login methods: Google only. Embedded wallets: Solana, created on login.
- [ ] Allowed origins: your real app domain(s) only. Remove `localhost` and ngrok.
- [ ] Recommended: add your own Google OAuth client in Privy, so the Google screen says "Velfi" rather than Privy.

## 5. Backend environment (Railway)

| Variable | Value |
|---|---|
| `SOLANA_CLUSTER` | `mainnet-beta` |
| `SOLANA_RPC_URL` | your Helius URL |
| `VELFI_PROGRAM_ID` | **leave empty** (lite mode) |
| `VELFI_FEE_PAYER_KEY` | contents of `velfi-mainnet-fee-payer.json` |
| `VELFI_AGENT_KEY` | contents of `velfi-mainnet-agent.json` |
| `JWT_SECRET` | new: `openssl rand -hex 32` |
| `ESCROW_SECRET` | new: `openssl rand -hex 32`. **Back it up.** Without it, invite money can't be moved. |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | production app |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | as before |
| `OPENROUTER_API_KEY` | as before |
| `APP_ORIGINS` | e.g. `https://app.velfi.xyz` |
| `MAX_NEW_ACCOUNTS_PER_DAY` | `10` |
| `MAX_NEW_ACCOUNTS_GLOBAL_PER_DAY` | `100` at launch (caps rent spend at about 0.2 SOL a day) |
| `MIN_FEE_PAYER_SOL` | `0.05` |
| `MAX_SCHEDULE_TOTAL` | `500` (largest total one schedule may cover) |
| `EMAIL_INVITES` | empty = on. Set `off` if you want legal sign-off first (see section 9). |
| `PAUSE_PAYMENTS` | empty. Set `on` to stop everything in an emergency. |
| `USDC_MINT`, `SCHEDULE_DEMO_SECS` | **must be empty**. The server refuses to start on mainnet otherwise. |

- [ ] **Run exactly one replica.** Approvals in progress and the schedule and invite runners live in the server's memory.
- [ ] Railway's deploy health check should use `/`. Point your uptime monitor at `/health` (it returns 503 when the fee payer runs low).
- [ ] Deploy, then open the logs. You must see `schedule runner started` and `invite refund runner started`, and no `Velfi will not start` message. The start-up check lists anything that is missing.

## 6. App and site (Vercel)

- [ ] Set the `frontend` environment: `VITE_SOLANA_CLUSTER=mainnet-beta`, `VITE_PRIVY_APP_ID=<production id>`, and optionally `VITE_SOLANA_RPC_URL`.
- [ ] Check that `frontend/vercel.json` rewrites `/api` to the mainnet backend URL.
- [ ] Run `npm run build` in `frontend` and in `landing`. Both must pass.
- [ ] Deploy both with `vercel --prod`.

## 7. Automated tests (before every deploy)

```bash
cd backend && npm install && npm test
```
You should see 87 passing: 53 unit tests and 34 route tests (19 for the core flows, 15 for lite mode). They cover:
- the allowance always equalling what your active schedules still need;
- a scheduled payment never being sent twice, early, or after a cancel;
- a failed payment pausing the schedule instead of retrying;
- invites being claimed exactly once, and refunds after 7 days;
- fee-payer caps, the low-balance pause and the kill switch;
- the mainnet start-up refusals;
- and every earlier flow: tampered transactions rejected, approvals single-use, sign-in, and the rate limits.

## 8. Mainnet dry run with small money (about 5 USDC, 30 minutes)

Use two Google accounts: **A** (you) and **B** (a second account you control). Open each transaction on Solscan.

| # | Do this | You should see |
|---|---|---|
| 1 | Sign in as A, claim a .vel name | A wallet address under Receive |
| 2 | Send 5 USDC to A's address from an exchange or Phantom. Send no SOL. | 5 USDC in the app |
| 3 | `send 1 USDC to <B>.vel` (B has never held USDC) | Success. On Solscan the fee payer is Velfi's, B's USDC account is created, and A spent 0 SOL. |
| 4 | Send 0.5 USDC to B again | Success, with no account creation this time |
| 5 | `split 1 USDC between <B>.vel and <another>.vel` | One transaction, two transfers |
| 6 | Send 0.5 USDC to an email that has never used Velfi, then sign in with that Google account | The money arrives on sign-up. The holding wallet's token account is closed, and its rent goes back to the fee payer. |
| 7 | Send 0.1 USDC to an unused email. In Supabase set that `escrow_invites.expires_at` to yesterday. | Within 10 minutes it is back in A's wallet and A gets a notification |
| 8 | `send 0.1 USDC to <B>.vel hourly for 2 payments` | One approval for 0.2 USDC to Velfi's agent address. The first payment goes now and the second an hour later. On Solscan, A's USDC account shows the agent as delegate. |
| 9 | Before the second payment, cancel it in Flows | No second payment, and the delegate is removed from A's USDC account |
| 10 | `stream 1 USDC to <B>.vel over 1 hour` | "Streaming payments are coming soon…" |
| 11 | Put about 0.01 SOL in A, then `swap 1 USDC to SOL` | A Jupiter swap lands |
| 12 | Set `PAUSE_PAYMENTS=on`, restart, try a send. Then set it back to empty. | "paused for maintenance", and nothing sent |
| 13 | `curl https://<backend>/health` | `"ok": true`, `"cluster": "mainnet-beta"`, `"mode": "lite"` |

If any row looks wrong, stop and send me the Solscan link and the backend log lines.

## 9. Risks to accept (or reduce) before announcing

- **The agent key is the crown jewel.** In lite mode Solana enforces each user's total allowance, but not the recipient. If the agent key leaked, someone could take up to the unspent allowance of every active schedule. Mitigations already in place:
  - the key is separate from the fee payer;
  - one schedule is capped at `MAX_SCHEDULE_TOTAL`;
  - payments re-check the rules on the server;
  - users can cancel anytime.

  If you ever rotate this key, existing schedules stop working and users have to set them up again.
- **Email invites mean Velfi briefly holds money** (up to 7 days). In some countries, Nigeria included, that can count as money transmission. Get a quick legal opinion, or launch with `EMAIL_INVITES=off` and turn it on later.
- **`ESCROW_SECRET` plus a database leak** would expose any unclaimed invite money. Keep both locked down, and keep the secret backed up, because losing it strands pending invites.
- **The backend has not had an external review.** Lite mode has no custom on-chain code to audit, but a second engineer should read `backend/routes/agent.js` (prepare and approve), `lib/schedule.js` and `lib/invites.js` before launch.
- **Velfi's program (streams, escrow, on-chain mandates)** stays off until it has an independent audit. Turning it on later only means setting `VELFI_PROGRAM_ID`. See `SOLANA.md`.
- **Copy:**
  - The site, litepaper and docs now say "soon" for streams, escrow and auto-save.
  - They no longer claim "on-chain guardrails it can never override".
  - They explain the two approve-once cases honestly.
  - Keep $VELFI token wording to "launching on", with no returns implied.

## 10. Day-one monitoring

- [ ] An uptime monitor on `/health` (Better Stack or UptimeRobot, both free) that alerts you when it returns 503.
- [ ] A watch on the fee payer address on Solscan. Top up from the reserve below 0.3 SOL.
- [ ] Search the Railway logs for these daily:
  - `FEE PAYER LOW`
  - `INVITE SAVE FAILED` (the money moved but the record didn't save: recover it by hand from the logged wallet)
  - `schedule tick`
  - `invite claim failed`
- [ ] Emergency stop: set `PAUSE_PAYMENTS=on` and restart. This stops new payments, scheduled payments and invite moves at once. Users' money is untouched in their own wallets.
