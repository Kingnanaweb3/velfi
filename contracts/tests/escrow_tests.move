#[test_only]
module velfi::escrow_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::clock::{Self};
    use velfi::escrow::{Self, Escrow};

    const SENDER: address = @0xA;
    const CLAIMER: address = @0xB;
    const ATTACKER: address = @0xD;

    // Helper — hash a token the same way the contract does
    fun make_hash(token: vector<u8>): vector<u8> {
        sui::hash::blake2b256(&token)
    }

    // ═══════════════════════════════════════
    // FUNCTIONAL TESTS
    // ═══════════════════════════════════════

    #[test]
    fun test_create_and_claim_escrow() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let token = b"secret_claim_token_123";
        let hash = make_hash(token);

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, CLAIMER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::claim_escrow(&mut e, token, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_refund_after_expiry() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let token = b"some_token";
        let hash = make_hash(token);

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        // Advance past 3 days (259_200_000 ms)
        clock::increment_for_testing(&mut clock, 259_200_001);

        ts::next_tx(&mut scenario, SENDER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::refund_escrow(&mut e, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY TESTS
    // ═══════════════════════════════════════

    #[test, expected_failure(abort_code = velfi::escrow::EWrongClaimHash)]
    fun test_wrong_token_cannot_claim() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let hash = make_hash(b"correct_token");

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            // Wrong token
            escrow::claim_escrow(&mut e, b"wrong_token", &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test, expected_failure(abort_code = velfi::escrow::EExpired)]
    fun test_cannot_claim_after_expiry() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let token = b"valid_token";
        let hash = make_hash(token);

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        // Expire it
        clock::increment_for_testing(&mut clock, 259_200_001);

        ts::next_tx(&mut scenario, CLAIMER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::claim_escrow(&mut e, token, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test, expected_failure(abort_code = velfi::escrow::ENotExpired)]
    fun test_cannot_refund_before_expiry() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let hash = make_hash(b"token");

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, SENDER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::refund_escrow(&mut e, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test, expected_failure(abort_code = velfi::escrow::ENotSender)]
    fun test_attacker_cannot_refund() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let hash = make_hash(b"token");

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        clock::increment_for_testing(&mut clock, 259_200_001);

        // Attacker tries to refund
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::refund_escrow(&mut e, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test, expected_failure(abort_code = velfi::escrow::ENotActive)]
    fun test_cannot_claim_twice() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        let token = b"claim_token";
        let hash = make_hash(token);

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, hash, &clock, ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, CLAIMER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::claim_escrow(&mut e, token, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        // Try to claim again
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut e = ts::take_shared<Escrow>(&scenario);
            escrow::claim_escrow(&mut e, token, &clock, ts::ctx(&mut scenario));
            ts::return_shared(e);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test, expected_failure(abort_code = velfi::escrow::EZeroAmount)]
    fun test_zero_amount_escrow() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(0, ts::ctx(&mut scenario));
            escrow::create_escrow(coin, b"token", &clock, ts::ctx(&mut scenario));
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
