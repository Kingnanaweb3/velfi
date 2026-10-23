> **Update:** Velfi now runs on BNB Chain. Start with [BNB.md](BNB.md). The Solana version is the git tag `solana-v1` (notes in docs/solana). The Sui notes below are history.

# Velfi — Status & Next Steps

**What it is:** Non-custodial AI money agent on Sui. "Tell your money what to do."
zkLogin (Google) · `.vel` names · Walrus receipts · Assisted + Autopilot modes with hard on-chain guardrail.
**Hackathon:** Sui Overflow 2026 · submission deadline **June 21, 2026** · core fixes targeted by **June 18**.

---

## ✅ Working (tested from terminal today)

- **AI pipeline:** classifier (Haiku) → parser (Sonnet 4.6) → doublecheck (Sonnet); assistant (Sonnet) for Q&A.
- **Human tone landed** — action-first, first-person, no command-echoing. ("Sending $20 — who's it going to?")
- **Multi-turn slot-filling** via conversation memory (give recipient, then amount → it assembles).
- **Token-choice flow** (bare number → "which token?" → completes on reply).
- **Insufficient-balance pre-flight guard** (accounts for gas) with human explanation + options.
- **Name resolution vs Supabase `users`:** `.vel` names, bare usernames, `0x` addresses, email-invite. Self-send detection + not-found handled.
- **Lookup** (single name) works.
- **Safety:** refuses to disable approval (warm, firm voice); ignores prompt-injection.
- **Swap PARSING + PROPOSAL** (DeepBook intent): from/to/amount, asks for missing amount.
- **Parser retry-once** on bad JSON (hardening against model variance).
- **Native SUI execution works** — a real 0.1 SUI send executed in the UI today.
- **Move contracts** published to testnet, guardrail 42/42 tests passing.
- **3 registered users:** `almondvel` (self/test), `joshhhy`, `lazarus`. Cross-user sends propose cleanly.

## ❌ Broken / not wired (the blockers, in priority order)

1. **Execution only handles native SUI.** `buildFromProposal` throws *"On-chain execution is wired for SUI right now."* → USDC/WAL/DEEP/etc. parse + propose but **cannot run**. THE main blocker.
2. **Swap can't execute** — `/run` has no DeepBook `buildSwap`; throws *"Missing a resolved recipient address"* (swap has no recipient).
3. **Transactions not logged on execute** → Activity is always empty even after a real send.
4. **Single-intent / single-token schema** — can't do "0.1 SUI and 2 USDC to him" (mixed tokens) or multiple intents in one instruction.
5. **Multi-name lookup** returns only the first name (regex grabs one).
6. **Server pending state not cleared on "new chat"** → a fresh instruction during a pending token-choice gets swallowed. (Workaround: `reset.js`.)
7. **Robotic hardcoded strings** ("Please check the recipients and try again").
8. **KB has no docs link** → assistant says it doesn't have docs handy.

---

## 🧠 Architecture decisions (agreed)

1. **Reason-first, then parse.** Let Sonnet reason BEFORE emitting JSON (`reasoning` as first key / drop JSON-only). Keep deterministic validators as the safety gate. Flow: **understand intent → extract pieces → validate → propose → approve → execute.**
2. **Multi-action is the differentiator.** Schema becomes an **`actions: []`** array — each action carries its own intent + token + recipient + amount. Sui **Programmable Transaction Blocks batch many actions into ONE atomic signature.** Demo line: *"do five things at once, approve once."*
3. **Build the token builder COMPOSABLY** — each action adds itself to a shared PTB, so multi-action = looping atoms into one PTB, not a rewrite.
4. **Keep validators + guardrail** (the safety moat). Upgrade the parser, don't rip it out.
5. **Curated KB over live RAG** for the deadline. Walrus for receipts; Walrus memory as a stretch.
6. **Lead the demo with Autopilot** (agent-signed, works) over Assisted.

## 🗺️ Build order (today → 18th)

1. **Generic token execution** (USDC, WAL, DEEP, SUIusdc…) — one composable builder. *The unblocker.*
2. **Log every executed action to `transactions`** → unlocks the Activity page with real data.
3. **Swap execution** via DeepBook (`buildSwap` + `/run`; pinned `@mysten/sui@1.38.0`; live digest already proven).
4. **Multi-action schema + PTB batching** (multi-token/multi-recipient, atomic) + reason-first parser emitting `actions: []`.
5. **Polish:** humanize hardcoded strings · fix multi-name lookup · add docs link to KB.
6. **Activity page** (frontend).
7. **Walrus memory** — highest time-risk; last, as the "wow." Setup: `curl -sL memory.walrus.xyz/skills/setup` · docs: https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory

Then: demo video (60–90s) · submission README (Package ID + tx digests) · ~20 beta testers + 2–3 testimonials.

**▶️ Immediate next action:** wire generic token execution. First paste into the new chat:
`cat lib/txBuilder.js` · `cat lib/tokens.js` · `sed -n '1,40p' routes/agent.js` · `sed -n '460,560p' routes/agent.js`

---

## 📌 Reference

- **Root:** `~/velfi/` → `landing/ backend/ frontend/ contracts/ docs/`
- **Backend:** Node+Express ESM, port 3001, run `node index.js`. Models via OpenRouter.
- **Frontend:** Vite+React (the app). OAuth ngrok tunnel: `https://discount-cape-profound.ngrok-free.dev`
- **Package ID:** `0xf0949553392359c4a96e7d7e6df97537458c3817e0e5f2f97fc2dd47ee76ddf3`
- **Agent wallet (funded, signs):** `0x7b57e4d59a058e4798e0cdf40bc309cacccc86777f766b3397a03ef238a03e87`
- **Publisher / UpgradeCap holder:** `0x75380bca19fad6159850104a134d131f46408f4759df47179b2350d231805630`
- **Test user (almondvel) address:** `0xdfb875bba6bfcade4efa0b7bed278c508f3a8d0d9c2bcf1e929525350b2be803`
- **Models:** classifier = Haiku 4.5; parser/assistant/doublecheck = Sonnet 4.6 (parser/assistant set via `.env` overrides).
- **Key files:** `lib/agentPrompts.js` (CLASSIFIER_SYS / PARSER_SYS / ASSISTANT_SYS) · `routes/agent.js` (VELFI_KB ~L40, pipeline ~L237+, `buildFromProposal` ~L20–32, `/run` ~L505) · `lib/txBuilder.js` · `lib/tokens.js` · `lib/agentValidators.js` · `lib/guardian.js` · `lib/openrouter.js` · `reset.js`
- **Supabase export style:** `export default supabase` (use `import supabase from './lib/supabase.js'`).
- **Testing:** `test-suite.js` + ad-hoc curl `say()` helper. **`reset.js` clears server pending state — REQUIRED between independent tests:** `node reset.js <address>`. Get JWT in browser console: `localStorage.getItem("velfi_token")`.
- **DeepBook:** `@mysten/deepbook-v3@0.17.0` + `@mysten/sui@1.38.0` (pinned to match nested copy). Proven swap digest: `25otCHfAxHiKWygqndN3HSUiUiPzgtrPG8JfJPbxRXCE`. Note: testnet SUI_DBUSDC pool was dry — need a liquid pool or DEEP for real fills.
- **Tokens to wire:** USDC, SUIusdc, WAL, DEEP (+ generic by coin type).
