<div align="center">

# Velfi

### Tell your money what to do.

A **non-custodial AI payments agent on Sui**. Send, split, stream, schedule, and swap — in plain English, with one approval.

**[Live App](https://app.velfi.xyz)** · **[Docs](https://kinnahjoshua67s-organization.gitbook.io/velfi/)** · **[Demo Video](https://youtube.com)**

Built for **Sui Overflow 2026** · DeFi & Payments Track

</div>

---

## The problem

On-chain payments are powerful, but the experience is hostile to actual humans:

- You paste 64-character `0x...` addresses and hope you didn't fat-finger one.
- Every payment is a **single, manual signature** — there's no native "pay my team every Friday," no "stream this contractor's pay over the month," no "split this bill three ways."
- Gas, coin objects, and token types leak into the face of someone who just wants to send money.
- Anything programmable — recurring, conditional, or multi-step payments — means writing and deploying a smart contract.

For **everyday and cross-border payments** — remittances, payroll, paying contractors, splitting costs — that friction is a wall. The people who would benefit most from fast, low-cost, programmable money are the ones least served by today's wallet UX. We built Velfi from Ghana/Nigeria, where this gap is lived, not theoretical.

## The solution

Velfi turns money into something you can **talk to**. You say what you want; Velfi works out the intent, shows you exactly what it will do, and — once you approve — settles it on Sui as a **single atomic transaction**.

```
send 0.5 SUI to ada.vel and 20 USDC to bola.vel
split 90 USDC between ada.vel, bola.vel and chidi.vel
stream 200 USDC to contractor.vel over 30 days
every Friday send 50 USDC to team.vel
swap 10 SUI to USDC
```

Each instruction becomes a clear, reviewable proposal. One tap to approve. One on-chain transaction.

The core ideas:

- **Human-readable identities** — `.vel` usernames instead of raw addresses.
- **One approval, atomic execution** — multiple tokens, recipients, and intents settle in a single Sui Programmable Transaction Block (PTB).
- **Programmable by default** — streams, schedules, splits, and swaps with no contract to write.
- **No seed phrases** — sign in with Google via zkLogin.
- **Always in control** — the agent only ever *proposes*; you approve. Approval cannot be turned off.

## What it does today

- Natural-language **send / split / multi-token / multi-recipient** payments, atomic in one PTB
- **Streams** — pay an amount out gradually over a fixed window
- **Schedules** — recurring payments (daily / weekly / monthly)
- **Swaps** via **DeepBook** (SUI / USDC / DEEP)
- **zkLogin** Google sign-in — no wallet install, no seed phrase
- **`.vel` name** resolution and on-Velfi lookups
- **Activity feed + Flows** dashboard for live streams and schedules
- Multi-turn conversation with **server-side slot-filling** — it remembers the in-progress payment instead of forgetting mid-sentence

## How it works

Velfi keeps the AI on the narrow job of *understanding language*, while every money-affecting decision is **deterministic code**. That split is what makes it reliable.

```
You --> Understand --> Validate --> Propose --> [ You approve ] --> Execute --> Sui
        (LLM parse)    (rules)      (preview)                       (atomic PTB)
```

1. **Understand** — the message is parsed into a structured intent: an `actions[]` array of `{ token, amount, recipient }` plus any stream / schedule / swap parameters.
2. **Validate** — non-LLM validators check amounts, resolve `.vel` names, verify balances, and catch self-sends.
3. **Propose** — Velfi builds a plain-English, reviewable proposal and waits.
4. **Approve** — you confirm. Approval is mandatory and cannot be disabled, even on request.
5. **Execute** — a single Sui PTB is assembled (one transfer per leg) and settled on-chain. Streams and schedules run on background tickers.

## Why Sui

- **Programmable Transaction Blocks** let us bundle many tokens, recipients, and actions into **one atomic transaction with one signature** — exactly what "do five things, approve once" needs.
- **zkLogin** gives seedless, Google-based onboarding — the difference between "download a wallet and back up 12 words" and "tap sign in."
- **DeepBook** provides native, on-chain swaps without bolting on an external DEX.
- **Low fees and fast finality** make small, everyday, and recurring payments actually viable.

## Tech stack

| Layer | Stack |
| --- | --- |
| Blockchain | Sui (testnet), Move, DeepBook, zkLogin |
| Agent | Groq-hosted Llama 3.3 70B (parsing + assistant) + classifier + deterministic validators |
| Frontend | Vite + React, deployed on Vercel |
| Backend | Node + Express (ESM), deployed on Railway |
| Data | Supabase (Postgres) — users, conversation state, transactions |

**Package ID (testnet):** `0xf0949553392359c4a96e7d7e6df97537458c3817e0e5f2f97fc2dd47ee76ddf3`

## Project structure

```
velfi/
├── backend/          # Express API + agent pipeline
│   ├── routes/       # auth, agent, users, account, payments, streams, schedule
│   ├── lib/          # agent prompts, validators, Sui + DeepBook, streams, schedule
│   └── index.js
├── frontend/         # Vite + React app
│   └── src/          # pages (Chat, Home, Flows, Invest, Account), components, zkLogin hook
└── contracts/        # Move package
```

## Getting started (local)

**Prerequisites:** Node 20+, a Supabase project, a Groq API key, and a Google OAuth client.

```bash
# backend
cd backend
npm install
cp .env.example .env        # add your Supabase, Groq, Google OAuth, and Sui credentials
node index.js               # http://localhost:3001

# frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## Roadmap

**Shipped this hackathon**
- Conversational send / split / multi-token / multi-recipient payments
- Streams, schedules, and DeepBook swaps
- zkLogin sign-in, `.vel` names, atomic multi-leg PTBs
- Activity + Flows dashboards, multi-turn slot-filling

**Next**
- Full client-side transaction signing — every payment signed end-to-end under the user's own zkLogin session (sign-in already runs on zkLogin; this extends it to signing each action in-browser)
- Autopilot mode with on-chain spending limits and guardrails (budgets, merchant controls, cooling-off windows)
- Escrow and conditional payments, and rule-based automation ("when X, do Y")
- Mainnet launch with native USDC
- Fiat on/off ramps for genuine cross-border everyday payments
- Walrus receipts and multi-sig beneficiary flows

## License

MIT — see [`LICENSE`](./LICENSE).

---

<div align="center">

**Velfi** — money you can talk to, on Sui.

</div>
