#[allow(duplicate_alias, lint(coin_field, public_entry, self_transfer))]
module velfi::guardrail {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;

    // ── Errors ───────────────────────────────────────────────
    const ENotActive: u64           = 0;
    const ENotOwner: u64            = 1;
    const ENotAuthorized: u64       = 2;
    const EZeroAmount: u64          = 3;
    const ENoRecipients: u64        = 4;
    const EOverPerTxCap: u64        = 5;
    const ERecipientNotAllowed: u64 = 6;
    const EInsufficientBudget: u64  = 7;
    const EExpired: u64             = 8;

    // ── Events ───────────────────────────────────────────────
    public struct MandateCreated has copy, drop {
        mandate_id: address, owner: address, agent: address,
        total_budget: u64, max_per_tx: u64, expires_at: u64,
    }
    public struct MandateExecuted has copy, drop {
        mandate_id: address, recipient: address, amount: u64,
        spent: u64, remaining: u64,
    }
    public struct MandateRevoked has copy, drop {
        mandate_id: address, owner: address, refunded: u64,
    }

    // ── Object ───────────────────────────────────────────────
    // T is the coin type the mandate is bound to. Because execute<T>
    // can only accept Coin<T>, a Mandate<USDC> can NEVER emit SUI.
    public struct Mandate<phantom T> has key {
        id: UID,
        owner: address,
        agent: address,
        recipients: vector<address>,
        max_per_tx: u64,
        total_budget: u64,
        spent: u64,
        expires_at: u64,
        coin: Coin<T>,
        active: bool,
    }

    // ── Create: user commits the budget + sets the rules ─────
    public entry fun create_mandate<T>(
        coin: Coin<T>,
        recipients: vector<address>,
        max_per_tx: u64,
        agent: address,
        duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let total = coin::value(&coin);
        assert!(total > 0, EZeroAmount);
        assert!(max_per_tx > 0, EZeroAmount);
        assert!(std::vector::length(&recipients) > 0, ENoRecipients);

        let owner = tx_context::sender(ctx);
        let expires_at = clock::timestamp_ms(clock) + duration_ms;

        let mandate = Mandate<T> {
            id: object::new(ctx),
            owner, agent, recipients, max_per_tx,
            total_budget: total, spent: 0, expires_at,
            coin, active: true,
        };

        event::emit(MandateCreated {
            mandate_id: object::uid_to_address(&mandate.id),
            owner, agent, total_budget: total, max_per_tx, expires_at,
        });

        transfer::share_object(mandate);
    }

    // ── Execute: agent (or owner) triggers a gated release ───
    public entry fun execute<T>(
        mandate: &mut Mandate<T>,
        amount: u64,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(mandate.active, ENotActive);
        let caller = tx_context::sender(ctx);
        assert!(caller == mandate.agent || caller == mandate.owner, ENotAuthorized);
        assert!(amount > 0, EZeroAmount);
        assert!(amount <= mandate.max_per_tx, EOverPerTxCap);
        assert!(clock::timestamp_ms(clock) <= mandate.expires_at, EExpired);
        assert!(is_whitelisted(&mandate.recipients, recipient), ERecipientNotAllowed);
        assert!(coin::value(&mandate.coin) >= amount, EInsufficientBudget);

        mandate.spent = mandate.spent + amount;
        let payment = coin::split(&mut mandate.coin, amount, ctx);
        transfer::public_transfer(payment, recipient);

        event::emit(MandateExecuted {
            mandate_id: object::uid_to_address(&mandate.id),
            recipient, amount,
            spent: mandate.spent,
            remaining: coin::value(&mandate.coin),
        });
    }

    // ── Revoke: owner pulls back everything remaining, anytime ─
    public entry fun revoke<T>(mandate: &mut Mandate<T>, ctx: &mut TxContext) {
        assert!(mandate.active, ENotActive);
        assert!(tx_context::sender(ctx) == mandate.owner, ENotOwner);

        let remaining = coin::value(&mandate.coin);
        mandate.active = false;

        event::emit(MandateRevoked {
            mandate_id: object::uid_to_address(&mandate.id),
            owner: mandate.owner, refunded: remaining,
        });

        if (remaining > 0) {
            let refund = coin::split(&mut mandate.coin, remaining, ctx);
            transfer::public_transfer(refund, mandate.owner);
        };
    }

    // ── Helpers / Views ──────────────────────────────────────
    fun is_whitelisted(list: &vector<address>, who: address): bool {
        let n = std::vector::length(list);
        let mut i = 0;
        while (i < n) {
            if (*std::vector::borrow(list, i) == who) return true;
            i = i + 1;
        };
        false
    }

    public fun mandate_status<T>(m: &Mandate<T>): (address, address, u64, u64, u64, u64, bool) {
        (m.owner, m.agent, m.total_budget, m.spent, coin::value(&m.coin), m.expires_at, m.active)
    }
}
