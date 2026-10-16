// Ports every case from the Sui Move test suite (guardrail, escrow, stream,
// security, edge cases) plus property checks that money is always conserved.
use velfi_core::*;

const OWNER: Key = [1; 32];
const AGENT: Key = [2; 32];
const ALICE: Key = [3; 32];
const BOB: Key = [4; 32];
const CAROL: Key = [5; 32];
const ATTACKER: Key = [9; 32];
const CLAIM_KEY: Key = [7; 32];
const T0: i64 = 1_760_000_000;
const DAY: i64 = 86_400;

fn sum(p: &[Payout]) -> u64 {
    p.iter().map(|x| x.amount).sum()
}

// ── Guardrail ─────────────────────────────────────────────────────────────
fn mandate() -> Mandate {
    Mandate::new(OWNER, AGENT, vec![ALICE, BOB], 100, 500, T0, 30 * DAY).unwrap()
}

#[test]
fn guardrail_create_and_execute() {
    let mut m = mandate();
    let p = m.execute(AGENT, 60, ALICE, T0 + 10).unwrap();
    assert_eq!(p, Payout { to: ALICE, amount: 60 });
    assert_eq!(m.spent, 60);
    assert_eq!(m.remaining(), 440);
}

#[test]
fn guardrail_owner_may_execute_too() {
    let mut m = mandate();
    assert!(m.execute(OWNER, 10, BOB, T0).is_ok());
}

#[test]
fn guardrail_multiple_recipients_and_revoke() {
    let mut m = mandate();
    m.execute(AGENT, 100, ALICE, T0).unwrap();
    m.execute(AGENT, 50, BOB, T0).unwrap();
    let r = m.revoke(OWNER).unwrap().unwrap();
    assert_eq!(r, Payout { to: OWNER, amount: 350 });
    assert!(!m.active);
    assert_eq!(m.execute(AGENT, 1, ALICE, T0), Err(VelfiError::NotActive));
}

#[test]
fn guardrail_over_per_tx_cap() {
    assert_eq!(mandate().execute(AGENT, 101, ALICE, T0), Err(VelfiError::OverPerTxCap));
}

#[test]
fn guardrail_wrong_recipient() {
    assert_eq!(mandate().execute(AGENT, 10, CAROL, T0), Err(VelfiError::RecipientNotAllowed));
}

#[test]
fn guardrail_over_budget() {
    let mut m = Mandate::new(OWNER, AGENT, vec![ALICE], 100, 150, T0, DAY).unwrap();
    m.execute(AGENT, 100, ALICE, T0).unwrap();
    assert_eq!(m.execute(AGENT, 100, ALICE, T0), Err(VelfiError::InsufficientBudget));
    assert_eq!(m.spent, 100, "a failed execute must not change state");
}

#[test]
fn guardrail_attacker_cannot_execute() {
    assert_eq!(mandate().execute(ATTACKER, 10, ALICE, T0), Err(VelfiError::NotAuthorized));
}

#[test]
fn guardrail_attacker_cannot_revoke() {
    assert_eq!(mandate().revoke(ATTACKER), Err(VelfiError::NotOwner));
}

#[test]
fn guardrail_agent_cannot_revoke() {
    assert_eq!(mandate().revoke(AGENT), Err(VelfiError::NotOwner));
}

#[test]
fn guardrail_execute_after_expiry() {
    assert_eq!(mandate().execute(AGENT, 10, ALICE, T0 + 30 * DAY + 1), Err(VelfiError::Expired));
}

#[test]
fn guardrail_execute_at_exact_expiry_is_allowed() {
    assert!(mandate().execute(AGENT, 10, ALICE, T0 + 30 * DAY).is_ok());
}

#[test]
fn guardrail_rejects_bad_setup() {
    assert_eq!(Mandate::new(OWNER, AGENT, vec![ALICE], 0, 10, T0, DAY), Err(VelfiError::ZeroAmount));
    assert_eq!(Mandate::new(OWNER, AGENT, vec![ALICE], 10, 0, T0, DAY), Err(VelfiError::ZeroAmount));
    assert_eq!(Mandate::new(OWNER, AGENT, vec![], 10, 10, T0, DAY), Err(VelfiError::NoRecipients));
    assert_eq!(Mandate::new(OWNER, AGENT, vec![ALICE, ALICE], 10, 10, T0, DAY), Err(VelfiError::DuplicateRecipient));
    assert_eq!(Mandate::new(OWNER, AGENT, vec![ALICE], 10, 10, T0, 0), Err(VelfiError::BadDuration));
    let many: Vec<Key> = (0..11u8).map(|i| [100 + i; 32]).collect();
    assert_eq!(Mandate::new(OWNER, AGENT, many, 10, 10, T0, DAY), Err(VelfiError::TooManyRecipients));
}

#[test]
fn guardrail_zero_amount_execute() {
    assert_eq!(mandate().execute(AGENT, 0, ALICE, T0), Err(VelfiError::ZeroAmount));
}

#[test]
fn guardrail_cannot_revoke_twice() {
    let mut m = mandate();
    m.revoke(OWNER).unwrap();
    assert_eq!(m.revoke(OWNER), Err(VelfiError::NotActive));
}

#[test]
fn guardrail_fully_spent_revoke_refunds_nothing() {
    let mut m = Mandate::new(OWNER, AGENT, vec![ALICE], 100, 100, T0, DAY).unwrap();
    m.execute(AGENT, 100, ALICE, T0).unwrap();
    assert_eq!(m.revoke(OWNER), Ok(None));
}

#[test]
fn guardrail_never_pays_more_than_budget() {
    let mut m = Mandate::new(OWNER, AGENT, vec![ALICE, BOB], 37, 1_000, T0, DAY).unwrap();
    let mut paid = 0;
    for i in 0..200 {
        if let Ok(p) = m.execute(AGENT, 1 + (i * 7) % 37, if i % 2 == 0 { ALICE } else { BOB }, T0 + i as i64) {
            paid += p.amount;
        }
    }
    let refund = m.revoke(OWNER).unwrap().map(|p| p.amount).unwrap_or(0);
    assert_eq!(paid + refund, 1_000);
}

// ── Escrow ────────────────────────────────────────────────────────────────
fn escrow() -> Escrow {
    Escrow::new(OWNER, CLAIM_KEY, 250, T0, 0).unwrap()
}

#[test]
fn escrow_create_and_claim() {
    let mut e = escrow();
    assert_eq!(e.expires_at, T0 + DEFAULT_ESCROW_SECS);
    assert_eq!(e.claim(CLAIM_KEY, ALICE, T0 + 100), Ok(Payout { to: ALICE, amount: 250 }));
}

#[test]
fn escrow_refund_after_expiry() {
    let mut e = escrow();
    assert_eq!(e.refund(OWNER, T0 + DEFAULT_ESCROW_SECS), Ok(Payout { to: OWNER, amount: 250 }));
}

#[test]
fn escrow_wrong_key_cannot_claim() {
    assert_eq!(escrow().claim(ATTACKER, ATTACKER, T0), Err(VelfiError::WrongClaimer));
}

#[test]
fn escrow_cannot_claim_after_expiry() {
    assert_eq!(escrow().claim(CLAIM_KEY, ALICE, T0 + DEFAULT_ESCROW_SECS), Err(VelfiError::Expired));
}

#[test]
fn escrow_cannot_refund_before_expiry() {
    assert_eq!(escrow().refund(OWNER, T0 + DEFAULT_ESCROW_SECS - 1), Err(VelfiError::NotExpired));
}

#[test]
fn escrow_attacker_cannot_refund() {
    assert_eq!(escrow().refund(ATTACKER, T0 + 10 * DAY), Err(VelfiError::NotSender));
}

#[test]
fn escrow_cannot_claim_twice_or_refund_after_claim() {
    let mut e = escrow();
    e.claim(CLAIM_KEY, ALICE, T0).unwrap();
    assert_eq!(e.claim(CLAIM_KEY, ALICE, T0), Err(VelfiError::NotActive));
    assert_eq!(e.refund(OWNER, T0 + 10 * DAY), Err(VelfiError::NotActive));
}

#[test]
fn escrow_zero_amount() {
    assert_eq!(Escrow::new(OWNER, CLAIM_KEY, 0, T0, 0), Err(VelfiError::ZeroAmount));
}

#[test]
fn escrow_custom_window() {
    assert_eq!(Escrow::new(OWNER, CLAIM_KEY, 5, T0, DAY).unwrap().expires_at, T0 + DAY);
}

// ── Vesting maths ─────────────────────────────────────────────────────────
#[test]
fn vesting_is_linear_and_capped() {
    assert_eq!(vested(1_000, T0, T0 + 100, T0 - 5), 0);
    assert_eq!(vested(1_000, T0, T0 + 100, T0), 0);
    assert_eq!(vested(1_000, T0, T0 + 100, T0 + 25), 250);
    assert_eq!(vested(1_000, T0, T0 + 100, T0 + 100), 1_000);
    assert_eq!(vested(1_000, T0, T0 + 100, T0 + 10_000), 1_000);
}

#[test]
fn vesting_large_amount_does_not_overflow() {
    assert_eq!(vested(u64::MAX, T0, T0 + 3, T0 + 1), u64::MAX / 3);
    assert_eq!(vested(u64::MAX, T0, T0 + 3, T0 + 3), u64::MAX);
}

// ── Stream ────────────────────────────────────────────────────────────────
fn stream() -> Stream {
    Stream::new(OWNER, ALICE, 1_000, T0, 100).unwrap()
}

#[test]
fn stream_start_and_claim() {
    let mut s = stream();
    assert_eq!(s.claim(ALICE, T0 + 40), Ok(Payout { to: ALICE, amount: 400 }));
    assert_eq!(s.claim(ALICE, T0 + 50), Ok(Payout { to: ALICE, amount: 100 }));
    assert_eq!(s.claim(ALICE, T0 + 50), Err(VelfiError::NoFunds));
}

#[test]
fn stream_claim_at_exact_end_takes_everything_and_closes() {
    let mut s = stream();
    assert_eq!(s.claim(ALICE, T0 + 100).unwrap().amount, 1_000);
    assert!(!s.active);
}

#[test]
fn stream_stop_splits_vested_and_refund() {
    let mut s = stream();
    s.claim(ALICE, T0 + 20).unwrap();
    let out = s.stop(OWNER, T0 + 60).unwrap();
    assert_eq!(out, vec![Payout { to: ALICE, amount: 400 }, Payout { to: OWNER, amount: 400 }]);
    assert_eq!(s.claim(ALICE, T0 + 90), Err(VelfiError::NotActive));
}

#[test]
fn stream_zero_amount_and_zero_duration() {
    assert_eq!(Stream::new(OWNER, ALICE, 0, T0, 100), Err(VelfiError::NoFunds));
    assert_eq!(Stream::new(OWNER, ALICE, 10, T0, 0), Err(VelfiError::BadDuration));
}

#[test]
fn stream_attacker_cannot_claim_or_stop() {
    let mut s = stream();
    assert_eq!(s.claim(ATTACKER, T0 + 50), Err(VelfiError::NotRecipient));
    assert_eq!(s.stop(ATTACKER, T0 + 50), Err(VelfiError::NotSender));
}

#[test]
fn stream_cannot_claim_before_it_starts() {
    assert_eq!(stream().claim(ALICE, T0), Err(VelfiError::NoFunds));
}

#[test]
fn stream_cannot_claim_stopped() {
    let mut s = stream();
    s.stop(OWNER, T0 + 10).unwrap();
    assert_eq!(s.claim(ALICE, T0 + 50), Err(VelfiError::NotActive));
}

#[test]
fn stream_money_is_conserved() {
    for stop_at in [0, 1, 33, 99, 100, 150] {
        let mut s = Stream::new(OWNER, ALICE, 997, T0, 100).unwrap();
        let mut paid = 0;
        for t in (0..stop_at).step_by(7) {
            if let Ok(p) = s.claim(ALICE, T0 + t) {
                paid += p.amount;
            }
        }
        if s.active {
            paid += sum(&s.stop(OWNER, T0 + stop_at).unwrap());
        }
        assert_eq!(paid, 997, "stop at {stop_at}");
    }
}

// ── Split stream ──────────────────────────────────────────────────────────
#[test]
fn split_stream_basic_and_no_dust_deposited() {
    let (mut s, deposit) = SplitStream::new(OWNER, vec![ALICE, BOB, CAROL], 1_000, T0, 100).unwrap();
    assert_eq!(s.per_person, 333);
    assert_eq!(deposit, 999, "the remainder stays with the sender");
    assert_eq!(s.claim(BOB, T0 + 50).unwrap().amount, 166);
    assert_eq!(s.claimable_for(ALICE, T0 + 50), Ok(166));
}

#[test]
fn split_stream_zero_recipients() {
    assert_eq!(SplitStream::new(OWNER, vec![], 100, T0, 10), Err(VelfiError::WrongLength));
}

#[test]
fn split_stream_claim_twice_same_time() {
    let (mut s, _) = SplitStream::new(OWNER, vec![ALICE, BOB], 100, T0, 10).unwrap();
    s.claim(ALICE, T0 + 5).unwrap();
    assert_eq!(s.claim(ALICE, T0 + 5), Err(VelfiError::NoFunds));
}

#[test]
fn split_stream_attacker_cannot_claim() {
    let (mut s, _) = SplitStream::new(OWNER, vec![ALICE, BOB], 100, T0, 10).unwrap();
    assert_eq!(s.claim(ATTACKER, T0 + 5), Err(VelfiError::NotRecipient));
}

#[test]
fn split_stream_stop_refunds_unvested_and_freezes_vesting() {
    let (mut s, deposit) = SplitStream::new(OWNER, vec![ALICE, BOB], 1_000, T0, 100).unwrap();
    assert_eq!(s.stop(ATTACKER, T0 + 30), Err(VelfiError::NotSender));
    let refund = s.stop(OWNER, T0 + 30).unwrap().unwrap();
    assert_eq!(refund, Payout { to: OWNER, amount: 700 });
    assert_eq!(s.stop(OWNER, T0 + 40), Err(VelfiError::AlreadyStopped));
    // Long after the stop, each can still claim exactly what vested by then.
    let a = s.claim(ALICE, T0 + 1_000).unwrap().amount;
    let b = s.claim(BOB, T0 + 1_000).unwrap().amount;
    assert_eq!((a, b), (150, 150));
    assert_eq!(a + b + refund.amount, deposit);
    assert!(s.is_finished(T0 + 1_000));
}

#[test]
fn split_stream_money_is_conserved() {
    for stop_at in [None, Some(0), Some(13), Some(77), Some(500)] {
        let (mut s, deposit) = SplitStream::new(OWNER, vec![ALICE, BOB, CAROL], 10_007, T0, 100).unwrap();
        let mut paid = 0;
        for t in (0..120).step_by(9) {
            if Some(t) == stop_at {
                paid += s.stop(OWNER, T0 + t).unwrap().map(|p| p.amount).unwrap_or(0);
            }
            for r in [ALICE, BOB, CAROL] {
                if let Ok(p) = s.claim(r, T0 + t) {
                    paid += p.amount;
                }
            }
        }
        if let Some(t) = stop_at.filter(|t| *t >= 120) {
            paid += s.stop(OWNER, T0 + t).unwrap().map(|p| p.amount).unwrap_or(0);
        }
        for r in [ALICE, BOB, CAROL] {
            if let Ok(p) = s.claim(r, T0 + 10_000) {
                paid += p.amount;
            }
        }
        assert_eq!(paid, deposit, "stop {stop_at:?}");
        assert!(s.is_finished(T0 + 10_000));
    }
}

// ── SafePay ───────────────────────────────────────────────────────────────
fn safe() -> SafePay {
    SafePay::new(OWNER, ALICE, 500, T0, 7 * DAY).unwrap()
}

#[test]
fn safe_pay_releases_after_both_confirm_in_either_order() {
    let mut s = safe();
    assert_eq!(s.confirm(ALICE), Ok(None));
    assert_eq!(s.confirm(OWNER), Ok(Some(Payout { to: ALICE, amount: 500 })));
    let mut s = safe();
    assert_eq!(s.confirm(OWNER), Ok(None));
    assert_eq!(s.confirm(ALICE), Ok(Some(Payout { to: ALICE, amount: 500 })));
}

#[test]
fn safe_pay_attacker_cannot_confirm() {
    assert_eq!(safe().confirm(ATTACKER), Err(VelfiError::NotAuthorized));
}

#[test]
fn safe_pay_cannot_double_confirm() {
    let mut s = safe();
    s.confirm(OWNER).unwrap();
    assert_eq!(s.confirm(OWNER), Err(VelfiError::AlreadyConfirmed));
}

#[test]
fn safe_pay_reclaim_only_after_deadline_and_only_sender() {
    let mut s = safe();
    assert_eq!(s.reclaim(OWNER, T0 + 7 * DAY), Err(VelfiError::DeadlineNotPassed));
    assert_eq!(s.reclaim(ATTACKER, T0 + 8 * DAY), Err(VelfiError::NotSender));
    assert_eq!(s.reclaim(OWNER, T0 + 7 * DAY + 1), Ok(Payout { to: OWNER, amount: 500 }));
}

#[test]
fn safe_pay_cannot_reclaim_after_release() {
    let mut s = safe();
    s.confirm(OWNER).unwrap();
    s.confirm(ALICE).unwrap();
    assert_eq!(s.reclaim(OWNER, T0 + 30 * DAY), Err(VelfiError::NotActive));
}

// ── Stage pay ─────────────────────────────────────────────────────────────
#[test]
fn stage_pay_releases_in_order_then_stops() {
    let (mut s, total) = StagePay::new(OWNER, ALICE, vec![100, 200, 300]).unwrap();
    assert_eq!(total, 600);
    assert_eq!(s.release_next(OWNER).unwrap().amount, 100);
    assert_eq!(s.release_next(OWNER).unwrap().amount, 200);
    assert_eq!(s.release_next(OWNER).unwrap().amount, 300);
    assert!(!s.active);
    assert_eq!(s.release_next(OWNER), Err(VelfiError::NotActive));
}

#[test]
fn stage_pay_bad_setups() {
    assert_eq!(StagePay::new(OWNER, ALICE, vec![]).unwrap_err(), VelfiError::WrongLength);
    assert_eq!(StagePay::new(OWNER, ALICE, vec![1, 0]).unwrap_err(), VelfiError::ZeroAmount);
    assert_eq!(StagePay::new(OWNER, ALICE, vec![1; 11]).unwrap_err(), VelfiError::TooManyStages);
    assert_eq!(StagePay::new(OWNER, ALICE, vec![u64::MAX, 1]).unwrap_err(), VelfiError::MathOverflow);
}

#[test]
fn stage_pay_attacker_cannot_release_or_cancel() {
    let (mut s, _) = StagePay::new(OWNER, ALICE, vec![10, 20]).unwrap();
    assert_eq!(s.release_next(ATTACKER), Err(VelfiError::NotSender));
    assert_eq!(s.release_next(ALICE), Err(VelfiError::NotSender));
    assert_eq!(s.cancel(ATTACKER), Err(VelfiError::NotSender));
}

#[test]
fn stage_pay_cancel_refunds_rest_and_cannot_repeat() {
    let (mut s, _) = StagePay::new(OWNER, ALICE, vec![10, 20, 30]).unwrap();
    s.release_next(OWNER).unwrap();
    assert_eq!(s.cancel(OWNER), Ok(Some(Payout { to: OWNER, amount: 50 })));
    assert_eq!(s.cancel(OWNER), Err(VelfiError::NotActive));
}
