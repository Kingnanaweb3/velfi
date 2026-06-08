#[test_only]
module velfi::edge_case_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::clock::{Self};
    use velfi::stream::{Self, Stream, SplitStream, SafePay, StagePay};

    const SENDER: address = @0xA;
    const RECIPIENT: address = @0xB;

    // ═══════════════════════════════════════
    // MONEY/MATH ATTACKS
    // ═══════════════════════════════════════

    // Zero amount stream
    #[test, expected_failure]
    fun test_zero_amount_stream() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(0, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // Zero duration stream — divide by zero in calc_claimable
    #[test, expected_failure]
    fun test_zero_duration_stream() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 0, &clock, ts::ctx(&mut scenario));
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // Split stream with zero recipients
    #[test, expected_failure(abort_code = velfi::stream::EWrongLength)]
    fun test_split_stream_zero_recipients() {
        let mut scenario = ts::begin(SENDER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            let recipients = vector[];
            stream::start_split_stream(coin, recipients, 1000, &clock, ts::ctx(&mut scenario));
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // Stage pay with zero stages
    #[test, expected_failure(abort_code = velfi::stream::EWrongLength)]
    fun test_stage_pay_zero_stages() {
        let mut scenario = ts::begin(SENDER);
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            let stages = vector[];
            stream::create_stage_pay(coin, RECIPIENT, stages, ts::ctx(&mut scenario));
        };
        ts::end(scenario);
    }

    // Overflow — extremely large amount
    #[test]
    fun test_large_amount_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            // Max u64 / 2 to avoid overflow in math
            let coin = coin::mint_for_testing<SUI>(9_000_000_000_000_000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1_000_000_000, &clock, ts::ctx(&mut scenario));
        };
        clock::increment_for_testing(&mut clock, 500_000_000);
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
    // STATE ATTACKS
    // ═══════════════════════════════════════

    // Claim from stopped stream
    #[test, expected_failure(abort_code = velfi::stream::ENotActive)]
    fun test_claim_stopped_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };
        clock::increment_for_testing(&mut clock, 300);
        // Sender stops stream
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::stop_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        // Recipient tries to claim stopped stream
        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::claim_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // Release stage after all stages done
    #[test, expected_failure(abort_code = velfi::stream::ENotActive)]
    fun test_release_beyond_last_stage() {
        let mut scenario = ts::begin(SENDER);
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(200, ts::ctx(&mut scenario));
            let stages = vector[100u64, 100u64];
            stream::create_stage_pay(coin, RECIPIENT, stages, ts::ctx(&mut scenario));
        };
        // Release stage 1
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<StagePay>(&scenario);
            stream::release_next_stage(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        // Release stage 2
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<StagePay>(&scenario);
            stream::release_next_stage(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        // Release stage 3 — should fail, no more stages
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<StagePay>(&scenario);
            stream::release_next_stage(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        ts::end(scenario);
    }

    // Cancel already cancelled stage pay
    #[test, expected_failure(abort_code = velfi::stream::ENotActive)]
    fun test_cancel_already_cancelled_stage_pay() {
        let mut scenario = ts::begin(SENDER);
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(300, ts::ctx(&mut scenario));
            let stages = vector[100u64, 100u64, 100u64];
            stream::create_stage_pay(coin, RECIPIENT, stages, ts::ctx(&mut scenario));
        };
        // Cancel once
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<StagePay>(&scenario);
            stream::cancel_stage_pay(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        // Cancel again — should fail
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<StagePay>(&scenario);
            stream::cancel_stage_pay(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        ts::end(scenario);
    }

    // Reclaim SafePay after already released
    #[test, expected_failure(abort_code = velfi::stream::ENotActive)]
    fun test_reclaim_safe_pay_after_release() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            stream::create_safe_pay(coin, RECIPIENT, 10000, &clock, ts::ctx(&mut scenario));
        };
        // Both confirm — releases funds
        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::sender_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<SafePay>(&scenario);
            stream::recipient_confirm(&mut s, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        // Try to reclaim after already released — should fail
        clock::increment_for_testing(&mut clock, 20000);
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
    // EDGE CASES
    // ═══════════════════════════════════════

    // Claim at exactly end time
    #[test]
    fun test_claim_at_exact_end_time() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };
        // Advance to exactly end time
        clock::increment_for_testing(&mut clock, 1000);
        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::claim_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // Claim split stream twice by same recipient
    #[test, expected_failure(abort_code = velfi::stream::ENoFunds)]
    fun test_claim_split_twice_same_recipient() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(2000, ts::ctx(&mut scenario));
            let recipients = vector[RECIPIENT, @0xC];
            stream::start_split_stream(coin, recipients, 1000, &clock, ts::ctx(&mut scenario));
        };
        clock::increment_for_testing(&mut clock, 1000);
        // First claim — ok
        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<SplitStream>(&scenario);
            stream::claim_split_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        // Second claim — should fail, nothing left
        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<SplitStream>(&scenario);
            stream::claim_split_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // Stage pay with mismatched amounts vs coin value
    #[test, expected_failure]
    fun test_stage_pay_amounts_exceed_coin() {
        let mut scenario = ts::begin(SENDER);
        ts::next_tx(&mut scenario, SENDER);
        {
            // Coin is 100 but stages total 300
            let coin = coin::mint_for_testing<SUI>(100, ts::ctx(&mut scenario));
            let stages = vector[100u64, 100u64, 100u64];
            stream::create_stage_pay(coin, RECIPIENT, stages, ts::ctx(&mut scenario));
        };
        ts::end(scenario);
    }
}
