#[test_only]
module velfi::guardrail_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock;
    use velfi::guardrail::{Self, Mandate};

    const OWNER: address = @0xA;
    const AGENT: address = @0xB;
    const ALICE: address = @0xC; // whitelisted
    const BOB: address   = @0xD; // whitelisted
    const EVE: address   = @0xE; // attacker / not whitelisted

    fun mint(amount: u64, sc: &mut ts::Scenario): Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ts::ctx(sc))
    }

    #[test]
    fun test_create_and_execute() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        {
            let budget = mint(1000, &mut sc);
            guardrail::create_mandate<SUI>(budget, vector[ALICE, BOB], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc));
        };
        ts::next_tx(&mut sc, AGENT);
        {
            let mut m = ts::take_shared<Mandate<SUI>>(&sc);
            guardrail::execute<SUI>(&mut m, 300, ALICE, &clock, ts::ctx(&mut sc));
            let (_, _, total, spent, remaining, _, active) = guardrail::mandate_status<SUI>(&m);
            assert!(total == 1000, 100);
            assert!(spent == 300, 101);
            assert!(remaining == 700, 102);
            assert!(active, 103);
            ts::return_shared(m);
        };
        ts::next_tx(&mut sc, ALICE);
        {
            let got = ts::take_from_address<Coin<SUI>>(&sc, ALICE);
            assert!(coin::value(&got) == 300, 104);
            ts::return_to_address(ALICE, got);
        };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    fun test_multiple_recipients_and_revoke() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        {
            let budget = mint(1000, &mut sc);
            guardrail::create_mandate<SUI>(budget, vector[ALICE, BOB], 400, AGENT, 10_000, &clock, ts::ctx(&mut sc));
        };
        ts::next_tx(&mut sc, AGENT);
        {
            let mut m = ts::take_shared<Mandate<SUI>>(&sc);
            guardrail::execute<SUI>(&mut m, 300, ALICE, &clock, ts::ctx(&mut sc));
            guardrail::execute<SUI>(&mut m, 200, BOB, &clock, ts::ctx(&mut sc));
            ts::return_shared(m);
        };
        // OWNER revokes, reclaims remaining 500
        ts::next_tx(&mut sc, OWNER);
        {
            let mut m = ts::take_shared<Mandate<SUI>>(&sc);
            guardrail::revoke<SUI>(&mut m, ts::ctx(&mut sc));
            ts::return_shared(m);
        };
        ts::next_tx(&mut sc, OWNER);
        {
            let back = ts::take_from_address<Coin<SUI>>(&sc, OWNER);
            assert!(coin::value(&back) == 500, 200);
            ts::return_to_address(OWNER, back);
        };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = velfi::guardrail::EOverPerTxCap)]
    fun test_over_per_tx_cap() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        { let b = mint(1000, &mut sc);
          guardrail::create_mandate<SUI>(b, vector[ALICE], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc)); };
        ts::next_tx(&mut sc, AGENT);
        { let mut m = ts::take_shared<Mandate<SUI>>(&sc);
          guardrail::execute<SUI>(&mut m, 500, ALICE, &clock, ts::ctx(&mut sc));
          ts::return_shared(m); };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = velfi::guardrail::ERecipientNotAllowed)]
    fun test_wrong_recipient() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        { let b = mint(1000, &mut sc);
          guardrail::create_mandate<SUI>(b, vector[ALICE], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc)); };
        ts::next_tx(&mut sc, AGENT);
        { let mut m = ts::take_shared<Mandate<SUI>>(&sc);
          guardrail::execute<SUI>(&mut m, 100, EVE, &clock, ts::ctx(&mut sc));
          ts::return_shared(m); };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = velfi::guardrail::EInsufficientBudget)]
    fun test_over_budget() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        { let b = mint(500, &mut sc);
          guardrail::create_mandate<SUI>(b, vector[ALICE], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc)); };
        ts::next_tx(&mut sc, AGENT);
        { let mut m = ts::take_shared<Mandate<SUI>>(&sc);
          guardrail::execute<SUI>(&mut m, 300, ALICE, &clock, ts::ctx(&mut sc));
          guardrail::execute<SUI>(&mut m, 300, ALICE, &clock, ts::ctx(&mut sc)); // only 200 left
          ts::return_shared(m); };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = velfi::guardrail::ENotAuthorized)]
    fun test_attacker_cannot_execute() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        { let b = mint(1000, &mut sc);
          guardrail::create_mandate<SUI>(b, vector[ALICE], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc)); };
        ts::next_tx(&mut sc, EVE);
        { let mut m = ts::take_shared<Mandate<SUI>>(&sc);
          guardrail::execute<SUI>(&mut m, 100, ALICE, &clock, ts::ctx(&mut sc));
          ts::return_shared(m); };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = velfi::guardrail::ENotOwner)]
    fun test_attacker_cannot_revoke() {
        let mut sc = ts::begin(OWNER);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        { let b = mint(1000, &mut sc);
          guardrail::create_mandate<SUI>(b, vector[ALICE], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc)); };
        ts::next_tx(&mut sc, EVE);
        { let mut m = ts::take_shared<Mandate<SUI>>(&sc);
          guardrail::revoke<SUI>(&mut m, ts::ctx(&mut sc));
          ts::return_shared(m); };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = velfi::guardrail::EExpired)]
    fun test_execute_after_expiry() {
        let mut sc = ts::begin(OWNER);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        { let b = mint(1000, &mut sc);
          guardrail::create_mandate<SUI>(b, vector[ALICE], 300, AGENT, 10_000, &clock, ts::ctx(&mut sc)); };
        clock::increment_for_testing(&mut clock, 20_000); // past expiry
        ts::next_tx(&mut sc, AGENT);
        { let mut m = ts::take_shared<Mandate<SUI>>(&sc);
          guardrail::execute<SUI>(&mut m, 100, ALICE, &clock, ts::ctx(&mut sc));
          ts::return_shared(m); };
        clock::destroy_for_testing(clock);
        ts::end(sc);
    }
}
