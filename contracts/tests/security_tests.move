#[test_only]
module velfi::security_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::clock::{Self};
    use velfi::stream::{Self, Stream, SplitStream, SafePay, StagePay};

    const SENDER: address = @0xA;
    const RECIPIENT: address = @0xB;
    const ATTACKER: address = @0xD;

    // ═══════════════════════════════════════
    // SECURITY 1: Attacker tries to claim someone else's stream
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENotRecipient)]
    fun test_attacker_cannot_claim_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };

        clock::increment_for_testing(&mut clock, 500);

        // ATTACKER tries to claim — should fail
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::claim_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 2: Claim before stream starts (0 time elapsed)
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENoFunds)]
    fun test_cannot_claim_before_stream_starts() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };

        // No time elapsed — try to claim immediately
        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::claim_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 3: Attacker tries to stop someone else's stream
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENotSender)]
    fun test_attacker_cannot_stop_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };

        clock::increment_for_testing(&mut clock, 500);

        // ATTACKER tries to stop — should fail
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::stop_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 4: Attacker confirms SafePay as sender
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENotSender)]
    fun test_attacker_cannot_confirm_safe_pay_as_sender() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            stream::create_safe_pay(coin, RECIPIENT, 10000, &clock, ts::ctx(&mut scenario));
        };

        // ATTACKER tries to confirm as sender — should fail
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::sender_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 5: Attacker confirms SafePay as recipient
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENotRecipient)]
    fun test_attacker_cannot_confirm_safe_pay_as_recipient() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            stream::create_safe_pay(coin, RECIPIENT, 10000, &clock, ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::sender_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        // ATTACKER tries to confirm as recipient — should fail
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::recipient_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 6: Double confirm SafePay
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::EAlreadyConfirmed)]
    fun test_cannot_double_confirm_safe_pay() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            stream::create_safe_pay(coin, RECIPIENT, 10000, &clock, ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::sender_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        // Try to confirm again — should fail
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::sender_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 7: Attacker releases stage pay
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENotSender)]
    fun test_attacker_cannot_release_stage() {
        let mut scenario = ts::begin(SENDER);

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(300, ts::ctx(&mut scenario));
            let stages = vector[100u64, 100u64, 100u64];
            stream::create_stage_pay(coin, RECIPIENT, stages, ts::ctx(&mut scenario));
        };

        // ATTACKER tries to release stage — should fail
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut s = ts::take_shared<StagePay>(&scenario);
            stream::release_next_stage(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 8: Reclaim SafePay before deadline
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::EDeadlinePassed)]
    fun test_cannot_reclaim_safe_pay_before_deadline() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            stream::create_safe_pay(coin, RECIPIENT, 10000, &clock, ts::ctx(&mut scenario));
        };

        // Try to reclaim before deadline — should fail
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::reclaim_safe_pay(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // SECURITY 9: Attacker claims split stream
    // ═══════════════════════════════════════
    #[test, expected_failure(abort_code = velfi::stream::ENotRecipient)]
    fun test_attacker_cannot_claim_split_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(2000, ts::ctx(&mut scenario));
            let recipients = vector[RECIPIENT, @0xC];
            stream::start_split_stream(coin, recipients, 1000, &clock, ts::ctx(&mut scenario));
        };

        clock::increment_for_testing(&mut clock, 1000);

        // ATTACKER tries to claim — should fail
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut s = ts::take_shared<SplitStream>(&scenario);
            stream::claim_split_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
