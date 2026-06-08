#[test_only]
module velfi::stream_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::clock::{Self};
    use velfi::stream::{Self, Stream, SplitStream, SafePay, StagePay};

    // Test addresses
    const SENDER: address = @0xA;
    const RECIPIENT: address = @0xB;
    const RECIPIENT2: address = @0xC;

    // ═══════════════════════════════════════
    // TEST 1: Single Stream
    // ═══════════════════════════════════════
    #[test]
    fun test_start_and_claim_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        // Start stream: 1000 MIST over 1000ms
        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };

        // Advance clock to halfway
        clock::increment_for_testing(&mut clock, 500);

        // Recipient claims halfway through
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
    // TEST 2: Stop Stream (refund sender)
    // ═══════════════════════════════════════
    #[test]
    fun test_stop_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
            stream::start_stream(coin, RECIPIENT, 1000, &clock, ts::ctx(&mut scenario));
        };

        clock::increment_for_testing(&mut clock, 300);

        ts::next_tx(&mut scenario, SENDER);
        {
            let mut s = ts::take_shared<Stream>(&scenario);
            stream::stop_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // TEST 3: Split Stream
    // ═══════════════════════════════════════
    #[test]
    fun test_split_stream() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(2000, ts::ctx(&mut scenario));
            let recipients = vector[RECIPIENT, RECIPIENT2];
            stream::start_split_stream(coin, recipients, 1000, &clock, ts::ctx(&mut scenario));
        };

        clock::increment_for_testing(&mut clock, 1000);

        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let mut s = ts::take_shared<SplitStream>(&scenario);
            stream::claim_split_stream(&mut s, &clock, ts::ctx(&mut scenario));
            ts::return_shared(s);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // TEST 4: Safe Pay (Escrow)
    // ═══════════════════════════════════════
    #[test]
    fun test_safe_pay() {
        let mut scenario = ts::begin(SENDER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
            stream::create_safe_pay(coin, RECIPIENT, 10000, &clock, ts::ctx(&mut scenario));
        };

        // Both confirm
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

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════
    // TEST 5: Stage Pay (Milestones)
    // ═══════════════════════════════════════
    #[test]
    fun test_stage_pay() {
        let mut scenario = ts::begin(SENDER);

        ts::next_tx(&mut scenario, SENDER);
        {
            let coin = coin::mint_for_testing<SUI>(300, ts::ctx(&mut scenario));
            let stages = vector[100u64, 100u64, 100u64];
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

        ts::end(scenario);
    }
}
