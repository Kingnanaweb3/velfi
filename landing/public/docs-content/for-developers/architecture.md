# Architecture

A high-level look at how a sentence becomes a settled payment.

### From words to transaction

When a user gives Velfi an instruction, it passes through a few conceptual stages:

1. **Interpretation.** The AI agent reads the plain-language instruction and identifies the intent — what kind of payment, to whom, how much, and on what terms.
2. **Resolution.** Names like `alice.vel` are resolved, amounts are parsed, and timing or conditions are determined.
3. **Proposal.** The agent assembles a structured transaction representing exactly what will happen, and presents it to the user.
4. **Approval.** The user reviews and approves. Their signature, from their own wallet, authorizes the transaction.
5. **Settlement.** The payment executes on Solana as program logic, settling almost instantly. The transaction is recorded on-chain.

### Where each technology fits

* **The AI agent** handles stages 1–3: understanding and proposing. It never holds keys or moves funds.
* **Google sign-in wallets** handle stage 4: the user's identity and signing authority, unlocked with their Google login and no seed phrase.
* **Solana programs** handle stage 5: the actual, safe execution of payments — including recurring and conditional logic that runs deterministically without per-action human review.
* **Solana itself** keeps the record: every payment is a public transaction anyone can verify on Solscan.

### Recurring and conditional flows

One-time payments execute once. Recurring or conditional instructions ("every Friday," "10% of every inbound payment") are set up as rules the user approves once. From then on, they run as contract logic — not as an autonomous AI with spending power.

### Why this separation matters

By keeping the AI strictly in the role of *proposing* and the blockchain in the role of *executing*, Velfi gets the best of both: natural-language ease of use, and the safety of deterministic, user-authorized, on-chain settlement.


