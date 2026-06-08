#[allow(duplicate_alias, lint(coin_field, public_entry), deprecated_usage, untyped_literal)]
module velfi::stream {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::event;

    // ── Errors ───────────────────────────────────────────────────────────
    const ENotRecipient: u64     = 0;
    const ENotSender: u64        = 1;
    const ENotActive: u64        = 2;
    const ENoFunds: u64          = 3;
    const EAlreadyConfirmed: u64 = 4;
    const EDeadlinePassed: u64   = 5;
    const ENoMoreStages: u64     = 6;
    const EWrongLength: u64      = 7;

    // ── Events ───────────────────────────────────────────────────────────
    public struct StreamStarted has copy, drop {
        stream_id: address,
        sender: address,
        recipient: address,
        total_amount: u64,
        start_time: u64,
        end_time: u64,
        stream_type: u8,
    }

    public struct StreamClaimed has copy, drop {
        stream_id: address,
        recipient: address,
        amount: u64,
        timestamp: u64,
    }

    public struct StreamStopped has copy, drop {
        stream_id: address,
        sender: address,
        refund_amount: u64,
    }

    public struct SafePayReleased has copy, drop {
        stream_id: address,
        recipient: address,
        amount: u64,
    }

    public struct SafePayRefunded has copy, drop {
        stream_id: address,
        sender: address,
        amount: u64,
    }

    public struct StageReleased has copy, drop {
        stream_id: address,
        stage: u64,
        amount: u64,
        recipient: address,
    }

    // ════════════════════════════════════════════════════════════════════
    // OBJECT TYPES
    // ════════════════════════════════════════════════════════════════════

    public struct Stream has key {
        id: UID,
        sender: address,
        recipient: address,
        total_amount: u64,
        claimed_amount: u64,
        start_time: u64,
        end_time: u64,
        coin: Coin<SUI>,
        active: bool,
    }

    public struct SplitStream has key {
        id: UID,
        sender: address,
        recipients: vector<address>,
        per_person_amount: u64,
        per_person_claimed: vector<u64>,
        start_time: u64,
        end_time: u64,
        coin: Coin<SUI>,
        active: bool,
    }

    public struct SafePay has key {
        id: UID,
        sender: address,
        recipient: address,
        amount: u64,
        sender_confirmed: bool,
        recipient_confirmed: bool,
        deadline: u64,
        coin: Coin<SUI>,
        active: bool,
    }

    public struct StagePay has key {
        id: UID,
        sender: address,
        recipient: address,
        stage_amounts: vector<u64>,
        current_stage: u64,
        total_stages: u64,
        coin: Coin<SUI>,
        active: bool,
    }

    // ════════════════════════════════════════════════════════════════════
    // STREAM — SINGLE
    // ════════════════════════════════════════════════════════════════════

    public entry fun start_stream(
        coin: Coin<SUI>,
        recipient: address,
        duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let start_time = clock::timestamp_ms(clock);
        let end_time = start_time + duration_ms;
        let total_amount = coin::value(&coin);
        assert!(total_amount > 0, ENoFunds);
        assert!(duration_ms > 0, EWrongLength);

        let stream = Stream {
            id: object::new(ctx),
            sender: tx_context::sender(ctx),
            recipient,
            total_amount,
            claimed_amount: 0,
            start_time,
            end_time,
            coin,
            active: true,
        };

        event::emit(StreamStarted {
            stream_id: object::uid_to_address(&stream.id),
            sender: tx_context::sender(ctx),
            recipient,
            total_amount,
            start_time,
            end_time,
            stream_type: 0,
        });

        transfer::share_object(stream);
    }

    public entry fun claim_stream(
        stream: &mut Stream,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(stream.active, ENotActive);
        assert!(tx_context::sender(ctx) == stream.recipient, ENotRecipient);

        let now = clock::timestamp_ms(clock);
        let claimable = calc_claimable(
            stream.total_amount, stream.claimed_amount,
            stream.start_time, stream.end_time, now
        );
        assert!(claimable > 0, ENoFunds);

        stream.claimed_amount = stream.claimed_amount + claimable;
        let payment = coin::split(&mut stream.coin, claimable, ctx);

        event::emit(StreamClaimed {
            stream_id: object::uid_to_address(&stream.id),
            recipient: stream.recipient,
            amount: claimable,
            timestamp: now,
        });

        transfer::public_transfer(payment, stream.recipient);
    }

    public entry fun stop_stream(
        stream: &mut Stream,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(stream.active, ENotActive);
        assert!(tx_context::sender(ctx) == stream.sender, ENotSender);

        let now = clock::timestamp_ms(clock);
        let claimable = calc_claimable(
            stream.total_amount, stream.claimed_amount,
            stream.start_time, stream.end_time, now
        );

        if (claimable > 0) {
            stream.claimed_amount = stream.claimed_amount + claimable;
            let payment = coin::split(&mut stream.coin, claimable, ctx);
            transfer::public_transfer(payment, stream.recipient);
        };

        let remaining = coin::value(&stream.coin);
        stream.active = false;

        event::emit(StreamStopped {
            stream_id: object::uid_to_address(&stream.id),
            sender: stream.sender,
            refund_amount: remaining,
        });

        if (remaining > 0) {
            let refund = coin::split(&mut stream.coin, remaining, ctx);
            transfer::public_transfer(refund, stream.sender);
        };
    }

    // ════════════════════════════════════════════════════════════════════
    // SPLIT STREAM — MULTIPLE RECIPIENTS
    // ════════════════════════════════════════════════════════════════════

    public entry fun start_split_stream(
        coin: Coin<SUI>,
        recipients: vector<address>,
        duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let n = std::vector::length(&recipients);
        assert!(n > 0, EWrongLength);

        let total = coin::value(&coin);
        let per_person = total / n;
        let start_time = clock::timestamp_ms(clock);
        let end_time = start_time + duration_ms;

        let mut claimed = vector[];
        let mut i = 0u64;
        while (i < n) {
            std::vector::push_back(&mut claimed, 0u64);
            i = i + 1;
        };

        let split = SplitStream {
            id: object::new(ctx),
            sender: tx_context::sender(ctx),
            recipients,
            per_person_amount: per_person,
            per_person_claimed: claimed,
            start_time,
            end_time,
            coin,
            active: true,
        };

        event::emit(StreamStarted {
            stream_id: object::uid_to_address(&split.id),
            sender: tx_context::sender(ctx),
            recipient: tx_context::sender(ctx),
            total_amount: total,
            start_time,
            end_time,
            stream_type: 1,
        });

        transfer::share_object(split);
    }

    public entry fun claim_split_stream(
        split: &mut SplitStream,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(split.active, ENotActive);

        let caller = tx_context::sender(ctx);
        let n = std::vector::length(&split.recipients);
        let mut idx = n;
        let mut i = 0u64;

        while (i < n) {
            if (*std::vector::borrow(&split.recipients, i) == caller) {
                idx = i;
                break
            };
            i = i + 1;
        };

        assert!(idx < n, ENotRecipient);

        let now = clock::timestamp_ms(clock);
        let already_claimed = *std::vector::borrow(&split.per_person_claimed, idx);
        let claimable = calc_claimable(
            split.per_person_amount, already_claimed,
            split.start_time, split.end_time, now
        );
        assert!(claimable > 0, ENoFunds);

        *std::vector::borrow_mut(&mut split.per_person_claimed, idx) = already_claimed + claimable;
        let payment = coin::split(&mut split.coin, claimable, ctx);

        event::emit(StreamClaimed {
            stream_id: object::uid_to_address(&split.id),
            recipient: caller,
            amount: claimable,
            timestamp: now,
        });

        transfer::public_transfer(payment, caller);
    }

    // ════════════════════════════════════════════════════════════════════
    // SAFE PAY — ESCROW
    // ════════════════════════════════════════════════════════════════════

    public entry fun create_safe_pay(
        coin: Coin<SUI>,
        recipient: address,
        deadline_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(clock);
        let amount = coin::value(&coin);

        let safe = SafePay {
            id: object::new(ctx),
            sender: tx_context::sender(ctx),
            recipient,
            amount,
            sender_confirmed: false,
            recipient_confirmed: false,
            deadline: now + deadline_ms,
            coin,
            active: true,
        };

        event::emit(StreamStarted {
            stream_id: object::uid_to_address(&safe.id),
            sender: tx_context::sender(ctx),
            recipient,
            total_amount: amount,
            start_time: now,
            end_time: now + deadline_ms,
            stream_type: 2,
        });

        transfer::share_object(safe);
    }

    public entry fun sender_confirm(
        safe: &mut SafePay,
        ctx: &mut TxContext
    ) {
        assert!(safe.active, ENotActive);
        assert!(tx_context::sender(ctx) == safe.sender, ENotSender);
        assert!(!safe.sender_confirmed, EAlreadyConfirmed);
        safe.sender_confirmed = true;
        if (safe.recipient_confirmed) {
            release_safe(safe, ctx);
        };
    }

    public entry fun recipient_confirm(
        safe: &mut SafePay,
        ctx: &mut TxContext
    ) {
        assert!(safe.active, ENotActive);
        assert!(tx_context::sender(ctx) == safe.recipient, ENotRecipient);
        assert!(!safe.recipient_confirmed, EAlreadyConfirmed);
        safe.recipient_confirmed = true;
        if (safe.sender_confirmed) {
            release_safe(safe, ctx);
        };
    }

    public entry fun reclaim_safe_pay(
        safe: &mut SafePay,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(safe.active, ENotActive);
        assert!(tx_context::sender(ctx) == safe.sender, ENotSender);
        assert!(clock::timestamp_ms(clock) > safe.deadline, EDeadlinePassed);

        let remaining = coin::value(&safe.coin);
        safe.active = false;

        event::emit(SafePayRefunded {
            stream_id: object::uid_to_address(&safe.id),
            sender: safe.sender,
            amount: remaining,
        });

        if (remaining > 0) {
            let refund = coin::split(&mut safe.coin, remaining, ctx);
            transfer::public_transfer(refund, safe.sender);
        };
    }

    fun release_safe(safe: &mut SafePay, ctx: &mut TxContext) {
        let amount = coin::value(&safe.coin);
        safe.active = false;

        event::emit(SafePayReleased {
            stream_id: object::uid_to_address(&safe.id),
            recipient: safe.recipient,
            amount,
        });

        if (amount > 0) {
            let payment = coin::split(&mut safe.coin, amount, ctx);
            transfer::public_transfer(payment, safe.recipient);
        };
    }

    // ════════════════════════════════════════════════════════════════════
    // STAGE PAY — MILESTONE RELEASE
    // ════════════════════════════════════════════════════════════════════

    public entry fun create_stage_pay(
        coin: Coin<SUI>,
        recipient: address,
        stage_amounts: vector<u64>,
        ctx: &mut TxContext
    ) {
        let total_stages = std::vector::length(&stage_amounts);
        assert!(total_stages > 0, EWrongLength);
        let total_amount = coin::value(&coin);
        assert!(total_amount > 0, ENoFunds);
        let mut sum = 0u64;
        let mut j = 0u64;
        while (j < total_stages) {
            sum = sum + *std::vector::borrow(&stage_amounts, j);
            j = j + 1;
        };
        assert!(sum == total_amount, EWrongLength);
        let stage = StagePay {
            id: object::new(ctx),
            sender: tx_context::sender(ctx),
            recipient,
            stage_amounts,
            current_stage: 0,
            total_stages,
            coin,
            active: true,
        };

        event::emit(StreamStarted {
            stream_id: object::uid_to_address(&stage.id),
            sender: tx_context::sender(ctx),
            recipient,
            total_amount,
            start_time: 0,
            end_time: 0,
            stream_type: 3,
        });

        transfer::share_object(stage);
    }

    public entry fun release_next_stage(
        stage: &mut StagePay,
        ctx: &mut TxContext
    ) {
        assert!(stage.active, ENotActive);
        assert!(tx_context::sender(ctx) == stage.sender, ENotSender);
        assert!(stage.current_stage < stage.total_stages, ENoMoreStages);

        let amount = *std::vector::borrow(&stage.stage_amounts, stage.current_stage);
        stage.current_stage = stage.current_stage + 1;

        if (stage.current_stage == stage.total_stages) {
            stage.active = false;
        };

        event::emit(StageReleased {
            stream_id: object::uid_to_address(&stage.id),
            stage: stage.current_stage,
            amount,
            recipient: stage.recipient,
        });

        let payment = coin::split(&mut stage.coin, amount, ctx);
        transfer::public_transfer(payment, stage.recipient);
    }

    public entry fun cancel_stage_pay(
        stage: &mut StagePay,
        ctx: &mut TxContext
    ) {
        assert!(stage.active, ENotActive);
        assert!(tx_context::sender(ctx) == stage.sender, ENotSender);

        let remaining = coin::value(&stage.coin);
        stage.active = false;

        event::emit(StreamStopped {
            stream_id: object::uid_to_address(&stage.id),
            sender: stage.sender,
            refund_amount: remaining,
        });

        if (remaining > 0) {
            let refund = coin::split(&mut stage.coin, remaining, ctx);
            transfer::public_transfer(refund, stage.sender);
        };
    }

    // ════════════════════════════════════════════════════════════════════
    // HELPERS + VIEW
    // ════════════════════════════════════════════════════════════════════

    fun calc_claimable(
        total: u64, claimed: u64,
        start: u64, end: u64, now: u64
    ): u64 {
        if (now <= start) return 0;
        let elapsed = if (now >= end) { end - start } else { now - start };
        let duration = end - start;
        let vested = (total as u128) * (elapsed as u128) / (duration as u128);
        let vested_u64 = vested as u64;
        if (vested_u64 > claimed) { vested_u64 - claimed } else { 0 }
    }

    public fun stream_info(s: &Stream): (address, address, u64, u64, u64, u64, bool) {
        (s.sender, s.recipient, s.total_amount, s.claimed_amount, s.start_time, s.end_time, s.active)
    }

    public fun claimable_now(s: &Stream, clock: &Clock): u64 {
        let now = clock::timestamp_ms(clock);
        calc_claimable(s.total_amount, s.claimed_amount, s.start_time, s.end_time, now)
    }

    public fun safe_pay_status(safe: &SafePay): (bool, bool, bool, u64) {
        (safe.sender_confirmed, safe.recipient_confirmed, safe.active, safe.deadline)
    }

    public fun stage_pay_status(stage: &StagePay): (u64, u64, bool) {
        (stage.current_stage, stage.total_stages, stage.active)
    }
}
