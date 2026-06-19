# Velfi Agent Spec — v0.1

The design of Velfi's instruction-parsing agent. The agent's only job is to turn a
plain-language instruction into a strict, validated JSON object describing a proposed
payment. It NEVER executes anything. Your backend validates the JSON, builds the
transaction, and the user approves it.

Base model: `anthropic/claude-haiku-4.5` (via OpenRouter)

---

## 1. Core principle

> The model proposes structure. Your code validates. The user approves. The model
> never moves money and never sees keys.

The model is a translator: sentence in → JSON out. Nothing else. If it cannot
confidently parse an instruction, it must say so in the JSON (low confidence +
clarifying question) rather than guess.

---

## 2. The output schema

The model must ALWAYS return a single JSON object, no prose, no markdown fences,
matching this shape:

```json
{
  "intent": "send | split | stream | schedule | escrow | automate | unknown",
  "confidence": 0.0,
  "needs_clarification": false,
  "clarifying_question": null,
  "payment": {
    "amount": null,
    "currency": "USD",
    "recipients": [
      { "name": null, "email": null, "share": null }
    ],
    "schedule": {
      "frequency": null,
      "day": null,
      "start": null,
      "end": null,
      "duration_days": null
    },
    "condition": null,
    "rule": {
      "trigger": null,
      "percentage": null
    }
  },
  "summary": null
}
```

Field rules:

- **intent** — one of the seven values. Use `"unknown"` if it isn't a payment instruction.
- **confidence** — 0.0–1.0. The model's own certainty it parsed correctly.
- **needs_clarification** — `true` if a critical field is missing or ambiguous.
- **clarifying_question** — a single, short question to the user if clarification is needed; else `null`.
- **payment.amount** — number only, no currency symbol. `null` if not stated.
- **payment.currency** — ISO code, default `"USD"` unless another is clearly stated.
- **payment.recipients** — array. Each has a `.vel` `name` OR an `email`, never both. `share` is a percentage (0–100) for splits, else `null`.
- **payment.schedule** — only for `schedule`/`stream`. `frequency` ∈ daily|weekly|monthly. `duration_days` for streams.
- **payment.condition** — plain-text condition for `escrow` (e.g. "work delivered").
- **payment.rule** — only for `automate`. `trigger` (e.g. "incoming_payment"), `percentage`.
- **summary** — one plain-English sentence restating what will happen, for the confirmation screen.

Any field not relevant to the detected intent stays `null`.

---

## 3. Intent types & what triggers them

| Intent | Trigger phrases | Required fields |
|---|---|---|
| `send` | "send", "pay", "transfer" (one-time, single recipient) | amount, one recipient |
| `split` | "split", "divide", "between", multiple recipients | amount, 2+ recipients (+shares) |
| `stream` | "stream", "over X days", "vest", continuous pay | amount, one recipient, duration_days |
| `schedule` | "every", "recurring", "each month", a cadence | amount, recipient, schedule.frequency |
| `escrow` | "hold", "until", "escrow", "release when" | amount, recipient, condition |
| `automate` | "whenever", "every time I receive", "X% of every" | rule.trigger, rule.percentage |
| `unknown` | anything not a payment instruction | — |

---

## 4. The system prompt

Paste this as the `system` message on every call.

```
You are Velfi's instruction parser. Velfi is a non-custodial payments app on the Sui
blockchain. Users write plain-language money instructions and you convert each one into
a single strict JSON object describing the proposed payment.

YOUR ONLY JOB is to output JSON matching the schema below. You do not execute payments,
you do not give financial advice, and you do not chat. You translate one instruction
into one JSON object.

Rules:
- Output ONLY the JSON object. No prose, no explanation, no markdown code fences.
- Detect exactly one intent: send, split, stream, schedule, escrow, automate, or unknown.
- Put numeric amounts in `amount` with no currency symbol. Default currency to "USD"
  unless the user clearly states another.
- A recipient has EITHER a `name` (a .vel handle like "alice.vel") OR an `email`, never both.
  Strip a leading "@" or trailing ".vel" inconsistencies into a clean "name" ending in ".vel".
- For splits, fill each recipient's `share` as a percentage that sums to 100 when the user
  gives percentages. If they say "evenly", divide equally. If amounts are explicit per person,
  put each amount as a separate send-like recipient and set intent to "split".
- For streams, you MUST capture duration in `duration_days`.
- For schedules, you MUST capture `frequency` (daily, weekly, or monthly) and `day` if stated.
- For escrow, capture the release condition as plain text in `condition`.
- For automate, capture the `trigger` and `percentage`.
- Always write a one-sentence `summary` restating the action for a human to confirm.
- Set `confidence` honestly (0.0–1.0).
- If a CRITICAL field is missing or the instruction is ambiguous, set
  `needs_clarification` to true and write ONE short `clarifying_question`. Do not guess
  amounts, recipients, or timing you were not given.
- If the input is not a payment instruction, return intent "unknown" with a clarifying
  question inviting them to describe a payment.

NEVER:
- Never invent a recipient, amount, or date the user did not provide.
- Never output more than one JSON object.
- Never include keys outside the schema.

SCHEMA:
{the schema from section 2}
```

(Replace `{the schema from section 2}` with the actual JSON schema block when you wire it up.)

---

## 5. Validation rules (your code, AFTER the model)

The model's output is never trusted directly. Before showing a confirmation, your backend MUST:

1. **Parse-check** — confirm it's valid JSON matching the schema. If not, re-ask or error.
2. **Confidence gate** — if `confidence < 0.6` OR `needs_clarification == true`, show the
   clarifying question instead of a payment. Never auto-propose a low-confidence parse.
3. **Amount sanity** — amount is a positive number; reject zero/negative/absurd values.
4. **Recipient resolution** — every `name` must resolve to a real `.vel` handle on-chain;
   every `email` must be a valid email. Unresolved name → ask the user.
5. **Split math** — recipient `share` values must sum to 100 (±0.01). Reject otherwise.
6. **Balance check** — user has sufficient balance for the amount. (Streams/schedules:
   check the first installment and warn on the total.)
7. **Self-send guard** — block sending to the user's own handle unless clearly intended.
8. **Re-state and confirm** — show the `summary` plus the structured details. NOTHING
   executes until the user taps approve and signs.

Only after all checks pass and the user approves do you build and submit the Move transaction.

---

## 6. Test instructions (for tomorrow)

Run these through the agent and check the JSON. Cover the happy path + the edge cases.

Happy path:
- "Send $50 to jordan.vel"
- "Split $300 evenly between alice.vel, bob.vel and carol.vel"
- "Split this 40/30/30 between alice.vel, bob.vel, carol.vel"
- "Stream $4,000 to alex.vel over 30 days"
- "Send rent of $1,200 to landlord.vel every month on the 1st"
- "Hold $2,000 for builder.vel until the work is delivered"
- "Move 10% of every payment I receive into savings"
- "Send $50 to jordan@gmail.com"

Edge / clarification cases (should set needs_clarification = true):
- "Send some money to Jordan"            (no amount, ambiguous recipient)
- "Pay my team"                          (no amount, no recipients)
- "Split the bill"                       (no amount, no recipients)
- "Stream money to alex.vel"             (no duration, no amount)
- "Pay rent"                             (no amount, no recipient, no cadence)

Not-a-payment (should return unknown):
- "What's my balance?"
- "How does escrow work?"
- "Hello"

---

## 7. Notes & open questions for later

- **Multi-currency**: schema supports a `currency` field, but payout/FX is a later concern.
  For now default USD and don't attempt conversion in the model.
- **Fallback model**: if Haiku mis-parses tricky inputs in testing, route only the
  low-confidence cases to `anthropic/claude-sonnet-4.6`. Don't add this until testing shows a need.
- **Prompt caching**: the system prompt is identical every call — enable caching to cut input cost ~90%.
- **Never let the model emit a signed transaction or a private key.** It only emits the JSON above.
```

---

# Velfi Agent Architecture — v0.2 (full system)

The parser above is one piece. Velfi's agent also guides users and answers questions.
This section defines the full flow: **2 AI roles + code validators + human approval**,
with an optional second-opinion check on low-confidence parses.

## Architecture overview

```
User message
  │
  ▼
[1. Classifier]  ── AI (Haiku, tiny) ── is this a PAYMENT or a QUESTION?
  │
  ├── QUESTION ──▶ [2a. Assistant]  ── AI (Haiku), answers grounded in GitBook docs
  │
  └── PAYMENT ───▶ [2b. Parser]     ── AI (Haiku), outputs strict JSON (section 2)
                        │
                        ▼
                   [low-confidence?] ── optional: re-parse with Sonnet, compare
                        │
                        ▼
                   [3. Validators]  ── YOUR CODE (deterministic, not AI)
                        │
                        ▼
                   [4. Confirmation] ── uses parser's `summary`
                        │
                        ▼
                   [5. User approves + signs with zkLogin keys]  ◀── real safety gate
```

Only steps 1, 2a, 2b (and the optional re-parse) are AI. Everything else is code or the human.

---

## Step 1 — Classifier

A tiny, fast call that decides where the message goes. Output is one word.

System prompt:

```
You are Velfi's message router. Classify the user's message into exactly one category:

- "payment"  — the user is instructing a money action (send, split, stream, schedule,
               escrow, automate). Imperative intent to move or set up money.
- "question" — the user is asking how something works, asking for help, asking about
               their account, settings, security, or anything informational.
- "other"    — greetings, small talk, or anything that fits neither.

Output ONLY the single lowercase word: payment, question, or other.
No punctuation, no explanation.
```

Routing:
- `payment` → Parser (Step 2b)
- `question` or `other` → Assistant (Step 2a)

Note: borderline imperative questions ("how do I split a bill?") classify as `question`
because of "how do I" — the classifier is trained by the prompt to treat informational
framing as a question even when a payment verb appears.

---

## Step 2a — Assistant (docs-grounded guide & support)

Answers user questions about Velfi, grounded in the GitBook docs you already wrote.
Use retrieval (RAG): find the most relevant doc section(s) for the question and pass them
in as context. The model answers ONLY from that context — it does not invent.

System prompt:

```
You are Velfi's assistant. Velfi is a non-custodial AI payments app on the Sui blockchain
where users move money with plain-language instructions and sign in with Google (no seed
phrase) via zkLogin.

Answer the user's question clearly, warmly, and briefly, using ONLY the Velfi documentation
provided in the context below. 

Rules:
- Ground every answer in the provided documentation. Do not invent features, prices,
  dates, or guarantees that aren't in the docs.
- If the answer isn't in the provided context, say you're not sure and suggest where they
  might look (e.g. "you can check the docs or reach support"), rather than guessing.
- Never give financial, investment, tax, or legal advice. If asked, gently decline and
  clarify Velfi is a tool for moving money, not an advisor.
- Never ask for or accept seed phrases, passwords, private keys, or full card numbers.
  If a user offers one, tell them never to share it with anyone.
- Keep answers conversational and short. Use plain language, not jargon.
- If the user actually wants to DO a payment (not ask about one), tell them they can just
  type the instruction (e.g. "Send $50 to jordan.vel").

CONTEXT (Velfi documentation):
{retrieved doc sections go here}
```

How to feed the docs:
- Simplest (hackathon): for each question, retrieve the 1–3 most relevant `.md` files from
  your GitBook docs and paste their text into `{retrieved doc sections}`.
- If you have few enough docs (you do — ~19 short pages), you can even pass a condensed
  version of ALL of them every call and skip retrieval entirely. With prompt caching this
  is cheap and removes the retrieval-quality risk. Recommended for launch.

---

## Step 2b — Parser

Exactly as specified in sections 2–4 above. Outputs strict JSON only.

---

## Optional — Low-confidence double-check (the smart part of your "swarm" instinct)

This is where a second AI opinion genuinely helps — and ONLY here.

After the parser returns:
- If `confidence >= 0.6` and `needs_clarification == false` → proceed to validators.
- If `confidence < 0.6` → re-parse the SAME instruction with `anthropic/claude-sonnet-4.6`
  using the identical parser prompt. Then:
  - If the two JSON results AGREE on intent + amount + recipients → proceed (higher trust).
  - If they DISAGREE → set needs_clarification and ask the user to confirm details.

This gives you "two models must agree" safety exactly where it matters (uncertain parses),
without paying for two calls on every transaction. Don't run this on high-confidence parses.

---

## Step 3 — Validators (YOUR CODE — never an AI)

Deterministic. Same as section 5 above: schema check, confidence gate, amount sanity,
recipient resolution on-chain, split math sums to 100, balance check, self-send guard.
An LLM must never perform these — they are `if` statements, and money logic must be
deterministic.

---

## Step 4 — Confirmation

Show the parser's `summary` plus structured details. Plain restatement of what will happen.

---

## Step 5 — Approve & sign

The user taps approve and signs with their own zkLogin-derived keys. ONLY now does your
backend build and submit the Move transaction. This human signature is the real safety
gate — more important than any number of agreeing agents.

---

## Cost & latency notes

- Classifier + parser = 2 tiny Haiku calls per payment (a few hundred tokens each) —
  fractions of a cent, sub-second.
- Assistant = 1 Haiku call grounded in docs.
- Sonnet double-check fires only on low-confidence parses (should be a small % of traffic).
- Enable prompt caching on all three system prompts (they're identical every call) for ~90%
  input savings.

## What is NOT in this system (deliberately)

- No "swarm" of agents debating every transaction. Deterministic checks are code.
- No AI performing validation, balance checks, or final execution.
- No fine-tuning required — the assistant is grounded in your docs (RAG), which stays
  current automatically when you edit the docs. Fine-tuning can come much later, if ever.
