module velfi::escrow {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::event;

    // 3 days in milliseconds
    const EXPIRY_MS: u64 = 259_200_000;

    // Errors
    const ENotSender: u64 = 0;
    const ENotExpired: u64 = 1;
    const EExpired: u64 = 2;
    const ENotActive: u64 = 3;
    const EWrongClaimHash: u64 = 4;
    const EZeroAmount: u64 = 5;

    // Events
    public struct EscrowCreated has copy, drop {
        escrow_id: address,
        sender: address,
        amount: u64,
        expires_at: u64,
    }

    public struct EscrowClaimed has copy, drop {
        escrow_id: address,
        claimer: address,
        amount: u64,
    }

    public struct EscrowRefunded has copy, drop {
        escrow_id: address,
        sender: address,
        amount: u64,
    }

    public struct Escrow has key {
        id: UID,
        sender: address,
        amount: u64,
        claim_hash: vector<u8>,
        expires_at: u64,
        coin: Coin<SUI>,
        active: bool,
    }

    // Create escrow — no recipient address needed
    // claim_hash = sha256 of the claim token (hashed off-chain)
    public entry fun create_escrow(
        coin: Coin<SUI>,
        claim_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&coin);
        assert!(amount > 0, EZeroAmount);

        let expires_at = clock::timestamp_ms(clock) + EXPIRY_MS;

        let escrow = Escrow {
            id: object::new(ctx),
            sender: tx_context::sender(ctx),
            amount,
            claim_hash,
            expires_at,
            coin,
            active: true,
        };

        event::emit(EscrowCreated {
            escrow_id: object::uid_to_address(&escrow.id),
            sender: tx_context::sender(ctx),
            amount,
            expires_at,
        });

        transfer::share_object(escrow);
    }

    // Claim escrow — anyone with correct claim token can claim
    public entry fun claim_escrow(
        escrow: &mut Escrow,
        claim_token: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(escrow.active, ENotActive);
        assert!(clock::timestamp_ms(clock) < escrow.expires_at, EExpired);

        // Verify claim token hash matches
        let token_hash = sui::hash::blake2b256(&claim_token);
        assert!(token_hash == escrow.claim_hash, EWrongClaimHash);

        let amount = coin::value(&escrow.coin);
        escrow.active = false;

        event::emit(EscrowClaimed {
            escrow_id: object::uid_to_address(&escrow.id),
            claimer: tx_context::sender(ctx),
            amount,
        });

        let payment = coin::split(&mut escrow.coin, amount, ctx);
        transfer::public_transfer(payment, tx_context::sender(ctx));
    }

    // Refund sender after expiry
    public entry fun refund_escrow(
        escrow: &mut Escrow,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(escrow.active, ENotActive);
        assert!(tx_context::sender(ctx) == escrow.sender, ENotSender);
        assert!(clock::timestamp_ms(clock) >= escrow.expires_at, ENotExpired);

        let amount = coin::value(&escrow.coin);
        escrow.active = false;

        event::emit(EscrowRefunded {
            escrow_id: object::uid_to_address(&escrow.id),
            sender: escrow.sender,
            amount,
        });

        let refund = coin::split(&mut escrow.coin, amount, ctx);
        transfer::public_transfer(refund, escrow.sender);
    }

    // View
    public fun escrow_status(e: &Escrow): (address, u64, u64, bool) {
        (e.sender, e.amount, e.expires_at, e.active)
    }
}
