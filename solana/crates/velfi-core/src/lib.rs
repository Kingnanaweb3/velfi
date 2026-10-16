//! Velfi core: the rules that decide who may move money, how much, and when.
//!
//! This crate has no dependencies so it builds and tests anywhere. The Solana
//! program converts its accounts into these structs, calls a method, performs
//! the returned token transfers, and writes the struct back. Every method either
//! returns the payouts to make or an error, and never half-applies a change:
//! on error the struct is left exactly as it was.
//!
//! Times are unix seconds (i64), amounts are token base units (u64).
#![forbid(unsafe_code)]

pub type Key = [u8; 32];

/// Hard caps keep account sizes fixed and transactions small.
pub const MAX_RECIPIENTS: usize = 10;
pub const MAX_STAGES: usize = 10;
/// Default escrow window when the caller passes 0: three days.
pub const DEFAULT_ESCROW_SECS: i64 = 3 * 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VelfiError {
    NotActive,
    NotOwner,
    NotAuthorized,
    ZeroAmount,
    NoRecipients,
    TooManyRecipients,
    DuplicateRecipient,
    OverPerTxCap,
    RecipientNotAllowed,
    InsufficientBudget,
    Expired,
    NotExpired,
    WrongClaimer,
    NotRecipient,
    NotSender,
    NoFunds,
    AlreadyConfirmed,
    DeadlineNotPassed,
    NoMoreStages,
    WrongLength,
    TooManyStages,
    BadDuration,
    AlreadyStopped,
    MathOverflow,
}

pub type Result<T> = core::result::Result<T, VelfiError>;

/// A token transfer the program must make out of the vault.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Payout {
    pub to: Key,
    pub amount: u64,
}

fn add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(VelfiError::MathOverflow)
}
fn sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or(VelfiError::MathOverflow)
}
fn end_time(now: i64, duration: i64) -> Result<i64> {
    if duration <= 0 {
        return Err(VelfiError::BadDuration);
    }
    now.checked_add(duration).ok_or(VelfiError::MathOverflow)
}

/// Linear vesting: how much of `total` has unlocked at `now` for a schedule
/// running from `start` to `end`. Uses u128 so large amounts cannot overflow.
pub fn vested(total: u64, start: i64, end: i64, now: i64) -> u64 {
    if now <= start || end <= start {
        return if end <= start && now >= end { total } else { 0 };
    }
    if now >= end {
        return total;
    }
    let elapsed = (now - start) as u128;
    let duration = (end - start) as u128;
    ((total as u128) * elapsed / duration) as u64
}

/// What can be claimed now, given what has already been claimed.
pub fn claimable(total: u64, claimed: u64, start: i64, end: i64, now: i64) -> u64 {
    vested(total, start, end, now).saturating_sub(claimed)
}

// ════════════════════════════════════════════════════════════════════════
// GUARDRAIL MANDATE: the budget an agent may spend on your behalf
// ════════════════════════════════════════════════════════════════════════

/// A spending mandate. The owner deposits a budget; the agent (or the owner)
/// may release it only to allowlisted recipients, never above `max_per_tx`
/// per payment, and never after `expires_at`. The owner can revoke anytime.
/// A mandate is bound to one token mint by the program, so a USDC mandate
/// can never pay out anything else.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mandate {
    pub owner: Key,
    pub agent: Key,
    pub recipients: Vec<Key>,
    pub max_per_tx: u64,
    pub total_budget: u64,
    pub spent: u64,
    pub expires_at: i64,
    pub active: bool,
}

impl Mandate {
    pub fn new(owner: Key, agent: Key, recipients: Vec<Key>, max_per_tx: u64, total_budget: u64, now: i64, duration: i64) -> Result<Self> {
        if total_budget == 0 || max_per_tx == 0 {
            return Err(VelfiError::ZeroAmount);
        }
        check_recipients(&recipients)?;
        Ok(Self { owner, agent, recipients, max_per_tx, total_budget, spent: 0, expires_at: end_time(now, duration)?, active: true })
    }

    pub fn remaining(&self) -> u64 {
        self.total_budget.saturating_sub(self.spent)
    }

    pub fn execute(&mut self, caller: Key, amount: u64, recipient: Key, now: i64) -> Result<Payout> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.agent && caller != self.owner {
            return Err(VelfiError::NotAuthorized);
        }
        if amount == 0 {
            return Err(VelfiError::ZeroAmount);
        }
        if amount > self.max_per_tx {
            return Err(VelfiError::OverPerTxCap);
        }
        if now > self.expires_at {
            return Err(VelfiError::Expired);
        }
        if !self.recipients.contains(&recipient) {
            return Err(VelfiError::RecipientNotAllowed);
        }
        if amount > self.remaining() {
            return Err(VelfiError::InsufficientBudget);
        }
        self.spent = add(self.spent, amount)?;
        Ok(Payout { to: recipient, amount })
    }

    /// Owner pulls back everything left. Returns the refund, if any.
    pub fn revoke(&mut self, caller: Key) -> Result<Option<Payout>> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.owner {
            return Err(VelfiError::NotOwner);
        }
        let left = self.remaining();
        self.active = false;
        Ok((left > 0).then_some(Payout { to: self.owner, amount: left }))
    }
}

fn check_recipients(list: &[Key]) -> Result<()> {
    if list.is_empty() {
        return Err(VelfiError::NoRecipients);
    }
    if list.len() > MAX_RECIPIENTS {
        return Err(VelfiError::TooManyRecipients);
    }
    for (i, a) in list.iter().enumerate() {
        if list[..i].contains(a) {
            return Err(VelfiError::DuplicateRecipient);
        }
    }
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════
// ESCROW: send to someone without a wallet yet (claim link)
// ════════════════════════════════════════════════════════════════════════

/// Funds held for a claim link. Whoever holds the claim key (a keypair whose
/// secret travels in the invite link) can claim before expiry, to any wallet.
/// Requiring a signature from that key, rather than revealing a secret in the
/// transaction, means nobody watching the network can copy the claim and
/// front-run it. After expiry the sender can take the funds back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Escrow {
    pub sender: Key,
    pub claim_authority: Key,
    pub amount: u64,
    pub expires_at: i64,
    pub active: bool,
}

impl Escrow {
    pub fn new(sender: Key, claim_authority: Key, amount: u64, now: i64, window: i64) -> Result<Self> {
        if amount == 0 {
            return Err(VelfiError::ZeroAmount);
        }
        let window = if window == 0 { DEFAULT_ESCROW_SECS } else { window };
        Ok(Self { sender, claim_authority, amount, expires_at: end_time(now, window)?, active: true })
    }

    /// `signer` must be the claim authority; `to` is the claimer's wallet.
    pub fn claim(&mut self, signer: Key, to: Key, now: i64) -> Result<Payout> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if now >= self.expires_at {
            return Err(VelfiError::Expired);
        }
        if signer != self.claim_authority {
            return Err(VelfiError::WrongClaimer);
        }
        self.active = false;
        Ok(Payout { to, amount: self.amount })
    }

    pub fn refund(&mut self, caller: Key, now: i64) -> Result<Payout> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.sender {
            return Err(VelfiError::NotSender);
        }
        if now < self.expires_at {
            return Err(VelfiError::NotExpired);
        }
        self.active = false;
        Ok(Payout { to: self.sender, amount: self.amount })
    }
}

// ════════════════════════════════════════════════════════════════════════
// STREAM: pay one person continuously over time
// ════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stream {
    pub sender: Key,
    pub recipient: Key,
    pub total: u64,
    pub claimed: u64,
    pub start: i64,
    pub end: i64,
    pub active: bool,
}

impl Stream {
    pub fn new(sender: Key, recipient: Key, total: u64, now: i64, duration: i64) -> Result<Self> {
        if total == 0 {
            return Err(VelfiError::NoFunds);
        }
        Ok(Self { sender, recipient, total, claimed: 0, start: now, end: end_time(now, duration)?, active: true })
    }

    pub fn claimable(&self, now: i64) -> u64 {
        if !self.active {
            return 0;
        }
        claimable(self.total, self.claimed, self.start, self.end, now)
    }

    pub fn claim(&mut self, caller: Key, now: i64) -> Result<Payout> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.recipient {
            return Err(VelfiError::NotRecipient);
        }
        let amount = self.claimable(now);
        if amount == 0 {
            return Err(VelfiError::NoFunds);
        }
        self.claimed = add(self.claimed, amount)?;
        if self.claimed == self.total {
            self.active = false;
        }
        Ok(Payout { to: self.recipient, amount })
    }

    /// Sender stops the stream: the recipient gets what has vested, the
    /// sender gets the rest back.
    pub fn stop(&mut self, caller: Key, now: i64) -> Result<Vec<Payout>> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.sender {
            return Err(VelfiError::NotSender);
        }
        let owed = self.claimable(now);
        let paid = add(self.claimed, owed)?;
        let refund = sub(self.total, paid)?;
        self.claimed = paid;
        self.active = false;
        let mut out = Vec::new();
        if owed > 0 {
            out.push(Payout { to: self.recipient, amount: owed });
        }
        if refund > 0 {
            out.push(Payout { to: self.sender, amount: refund });
        }
        Ok(out)
    }
}

// ════════════════════════════════════════════════════════════════════════
// SPLIT STREAM: stream equal shares to several people
// ════════════════════════════════════════════════════════════════════════

/// Equal shares streamed to several recipients. Unlike the Sui version, the
/// sender can stop it: vesting freezes at that moment, recipients keep what
/// had vested (and can still claim it), and the unvested part goes back to
/// the sender. Any remainder from the equal split is never deposited, so no
/// dust is ever locked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SplitStream {
    pub sender: Key,
    pub recipients: Vec<Key>,
    pub claimed: Vec<u64>,
    pub per_person: u64,
    pub start: i64,
    pub end: i64,
    pub stopped_at: Option<i64>,
}

impl SplitStream {
    /// Returns the stream and how much the sender must deposit (per_person × n).
    pub fn new(sender: Key, recipients: Vec<Key>, total: u64, now: i64, duration: i64) -> Result<(Self, u64)> {
        check_recipients(&recipients).map_err(|e| if e == VelfiError::NoRecipients { VelfiError::WrongLength } else { e })?;
        let n = recipients.len() as u64;
        let per_person = total / n;
        if per_person == 0 {
            return Err(VelfiError::NoFunds);
        }
        let deposit = per_person.checked_mul(n).ok_or(VelfiError::MathOverflow)?;
        let claimed = vec![0; recipients.len()];
        Ok((Self { sender, recipients, claimed, per_person, start: now, end: end_time(now, duration)?, stopped_at: None }, deposit))
    }

    fn vest_until(&self, now: i64) -> i64 {
        match self.stopped_at {
            Some(t) => now.min(t),
            None => now,
        }
    }

    pub fn claimable_for(&self, who: Key, now: i64) -> Result<u64> {
        let i = self.recipients.iter().position(|r| *r == who).ok_or(VelfiError::NotRecipient)?;
        Ok(claimable(self.per_person, self.claimed[i], self.start, self.end, self.vest_until(now)))
    }

    pub fn claim(&mut self, caller: Key, now: i64) -> Result<Payout> {
        let i = self.recipients.iter().position(|r| *r == caller).ok_or(VelfiError::NotRecipient)?;
        let amount = claimable(self.per_person, self.claimed[i], self.start, self.end, self.vest_until(now));
        if amount == 0 {
            return Err(VelfiError::NoFunds);
        }
        self.claimed[i] = add(self.claimed[i], amount)?;
        Ok(Payout { to: caller, amount })
    }

    /// Sender stops the split. Returns the refund of everything unvested.
    pub fn stop(&mut self, caller: Key, now: i64) -> Result<Option<Payout>> {
        if caller != self.sender {
            return Err(VelfiError::NotSender);
        }
        if self.stopped_at.is_some() {
            return Err(VelfiError::AlreadyStopped);
        }
        let v = vested(self.per_person, self.start, self.end, now);
        let unvested_each = sub(self.per_person, v)?;
        let refund = unvested_each.checked_mul(self.recipients.len() as u64).ok_or(VelfiError::MathOverflow)?;
        self.stopped_at = Some(now.max(self.start));
        Ok((refund > 0).then_some(Payout { to: self.sender, amount: refund }))
    }

    /// True once every share that will ever be claimable has been claimed.
    pub fn is_finished(&self, now: i64) -> bool {
        let until = self.vest_until(now);
        let finished_vesting = self.stopped_at.is_some() || now >= self.end;
        finished_vesting && self.claimed.iter().all(|c| *c >= vested(self.per_person, self.start, self.end, until))
    }
}

// ════════════════════════════════════════════════════════════════════════
// SAFEPAY: both sides confirm, then funds release
// ════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SafePay {
    pub sender: Key,
    pub recipient: Key,
    pub amount: u64,
    pub sender_confirmed: bool,
    pub recipient_confirmed: bool,
    pub deadline: i64,
    pub active: bool,
}

impl SafePay {
    pub fn new(sender: Key, recipient: Key, amount: u64, now: i64, window: i64) -> Result<Self> {
        if amount == 0 {
            return Err(VelfiError::ZeroAmount);
        }
        Ok(Self { sender, recipient, amount, sender_confirmed: false, recipient_confirmed: false, deadline: end_time(now, window)?, active: true })
    }

    /// Either party confirms. Returns the release payout once both have.
    pub fn confirm(&mut self, caller: Key) -> Result<Option<Payout>> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller == self.sender {
            if self.sender_confirmed {
                return Err(VelfiError::AlreadyConfirmed);
            }
            self.sender_confirmed = true;
        } else if caller == self.recipient {
            if self.recipient_confirmed {
                return Err(VelfiError::AlreadyConfirmed);
            }
            self.recipient_confirmed = true;
        } else {
            return Err(VelfiError::NotAuthorized);
        }
        if self.sender_confirmed && self.recipient_confirmed {
            self.active = false;
            return Ok(Some(Payout { to: self.recipient, amount: self.amount }));
        }
        Ok(None)
    }

    /// After the deadline, the sender can take back an unreleased SafePay.
    pub fn reclaim(&mut self, caller: Key, now: i64) -> Result<Payout> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.sender {
            return Err(VelfiError::NotSender);
        }
        if now <= self.deadline {
            return Err(VelfiError::DeadlineNotPassed);
        }
        self.active = false;
        Ok(Payout { to: self.sender, amount: self.amount })
    }
}

// ════════════════════════════════════════════════════════════════════════
// STAGE PAY: release in milestones
// ════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StagePay {
    pub sender: Key,
    pub recipient: Key,
    pub stages: Vec<u64>,
    pub current: u8,
    pub active: bool,
}

impl StagePay {
    /// Returns the plan and the total the sender must deposit.
    pub fn new(sender: Key, recipient: Key, stages: Vec<u64>) -> Result<(Self, u64)> {
        if stages.is_empty() {
            return Err(VelfiError::WrongLength);
        }
        if stages.len() > MAX_STAGES {
            return Err(VelfiError::TooManyStages);
        }
        if stages.iter().any(|s| *s == 0) {
            return Err(VelfiError::ZeroAmount);
        }
        let mut total = 0u64;
        for s in &stages {
            total = add(total, *s)?;
        }
        Ok((Self { sender, recipient, stages, current: 0, active: true }, total))
    }

    pub fn remaining(&self) -> u64 {
        self.stages[self.current as usize..].iter().sum()
    }

    pub fn release_next(&mut self, caller: Key) -> Result<Payout> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.sender {
            return Err(VelfiError::NotSender);
        }
        let i = self.current as usize;
        if i >= self.stages.len() {
            return Err(VelfiError::NoMoreStages);
        }
        let amount = self.stages[i];
        self.current += 1;
        if self.current as usize == self.stages.len() {
            self.active = false;
        }
        Ok(Payout { to: self.recipient, amount })
    }

    pub fn cancel(&mut self, caller: Key) -> Result<Option<Payout>> {
        if !self.active {
            return Err(VelfiError::NotActive);
        }
        if caller != self.sender {
            return Err(VelfiError::NotSender);
        }
        let left = self.remaining();
        self.active = false;
        Ok((left > 0).then_some(Payout { to: self.sender, amount: left }))
    }
}
