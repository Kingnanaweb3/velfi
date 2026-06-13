# Overview

This section gives a high-level look at how Velfi is built, for developers, partners, and the technically curious.

{% hint style="info" %}
A full developer SDK is coming. This overview describes the stack conceptually — see [SDK (coming soon)](sdk.md) for what's planned.
{% endhint %}

### The stack

Velfi is built on the **Sui** blockchain and a small set of its native technologies:

* **Sui** — the layer-1 blockchain Velfi settles on. Chosen for sub-second finality, near-zero fees, and native support for the features below.
* **Move** — the smart contract language Velfi's payment logic is written in. Move is designed for safe asset handling, which matters when software moves real money automatically.
* **zkLogin** — Sui's native authentication primitive. It lets users sign in with Google and derive a self-custodial wallet with no seed phrase.
* **Walrus** — Sui's decentralized storage layer, used to keep payment receipts and records verifiable without a central database.

### The AI layer

Velfi's agent is a language model, retrained on financial logic, that interprets a user's plain-language instruction and turns it into a structured, on-chain payment.

Crucially, the AI's role is limited to **interpretation and proposal**. It assembles a transaction for the user to approve — it holds no keys and has no ability to move funds on its own.

### The principle that ties it together

> The agent proposes. The user approves. Only the user holds the keys.

Every design decision in Velfi follows from this: the AI makes money easy to instruct, the blockchain makes it settle safely and instantly, and the user stays in complete control throughout.

Next: [Architecture →](architecture.md)
