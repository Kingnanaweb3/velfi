# Overview

This section gives a high-level look at how Velfi is built, for developers, partners, and the technically curious.

{% hint style="info" %}
A full developer SDK is coming. This overview describes the stack conceptually — see [SDK (coming soon)](/velfi/for-developers/sdk.md) for what's planned.
{% endhint %}

### The stack

Velfi is launching on **BNB Chain** and uses a small set of well-established building blocks:

* **BNB Chain** — the network Velfi settles on. Chosen for near-instant settlement (blocks in under a second), fees of a fraction of a cent, and deep stablecoin liquidity, including USDT and USDC.
* **BEP-20 token contracts** — payments use BNB Chain's standard token contracts. A scheduled payment is a token allowance capped at that schedule's total, so recurring payments execute deterministically inside limits the user signed.
* **Google sign-in wallets** — each user gets a BNB Chain wallet unlocked with Google sign-in, with no seed phrase. Velfi covers the network fee, so users never need BNB for gas.
* **One approval** — Velfi prepares every transaction an instruction needs, and the user approves them all with one slide, so "do five things, approve once" just works.
* **PancakeSwap** — token swaps (coming soon) route through BNB Chain's on-chain liquidity.

### The AI layer

Velfi's agent is a language model that interprets a user's plain-language instruction and turns it into a structured, on-chain payment.

Crucially, the AI's role is limited to **interpretation and proposal**. It assembles a transaction for the user to approve — it holds no keys and has no ability to move funds on its own.

### The principle that ties it together

> The agent proposes. The user approves. Only the user holds the keys.

Every design decision in Velfi follows from this: the AI makes money easy to instruct, the blockchain makes it settle safely, and the user stays in complete control throughout.

Next: [Architecture →](/velfi/for-developers/architecture.md)
