# Overview

This section gives a high-level look at how Velfi is built, for developers, partners, and the technically curious.

{% hint style="info" %}
A full developer SDK is coming. This overview describes the stack conceptually — see [SDK (coming soon)](/velfi/for-developers/sdk.md) for what's planned.
{% endhint %}

### The stack

Velfi is launching on **Solana** and uses a small set of well-established building blocks:

* **Solana** — the network Velfi settles on. Chosen for near-instant settlement, fees of a fraction of a cent, and deep stablecoin liquidity, including natively issued USDC.
* **Solana programs** — Velfi's payment logic (streams, escrow, spending limits) runs as on-chain programs written in Rust with the Anchor framework, so recurring and conditional payments execute deterministically.
* **Google sign-in wallets** — each user gets a Solana wallet unlocked with Google sign-in, with no seed phrase. Velfi acts as the fee payer, so users never need SOL for gas.
* **Atomic transactions** — a Solana transaction can carry many instructions that all succeed or all fail together, so "do five things, approve once" is native.
* **Jupiter** — token swaps are routed through Solana's on-chain liquidity.

### The AI layer

Velfi's agent is a language model that interprets a user's plain-language instruction and turns it into a structured, on-chain payment.

Crucially, the AI's role is limited to **interpretation and proposal**. It assembles a transaction for the user to approve — it holds no keys and has no ability to move funds on its own.

### The principle that ties it together

> The agent proposes. The user approves. Only the user holds the keys.

Every design decision in Velfi follows from this: the AI makes money easy to instruct, the blockchain makes it settle safely, and the user stays in complete control throughout.

Next: [Architecture →](/velfi/for-developers/architecture.md)
