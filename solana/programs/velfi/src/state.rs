use anchor_lang::prelude::*;
use velfi_core::Key;
// Vec caps below (10) match velfi_core::MAX_RECIPIENTS and MAX_STAGES.

pub const MANDATE_SEED: &[u8] = b"mandate";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const STREAM_SEED: &[u8] = b"stream";
pub const SPLIT_SEED: &[u8] = b"split";
pub const SAFE_SEED: &[u8] = b"safepay";
pub const STAGE_SEED: &[u8] = b"stagepay";

pub fn k(p: &Pubkey) -> Key {
    p.to_bytes()
}
pub fn pk(k: Key) -> Pubkey {
    Pubkey::new_from_array(k)
}
pub fn keys(v: &[Pubkey]) -> Vec<Key> {
    v.iter().map(k).collect()
}

#[account]
#[derive(InitSpace)]
pub struct MandateState {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub id: u64,
    pub bump: u8,
    #[max_len(10)]
    pub recipients: Vec<Pubkey>,
    pub max_per_tx: u64,
    pub total_budget: u64,
    pub spent: u64,
    pub expires_at: i64,
    pub active: bool,
}

impl MandateState {
    pub fn to_core(&self) -> velfi_core::Mandate {
        velfi_core::Mandate {
            owner: k(&self.owner),
            agent: k(&self.agent),
            recipients: keys(&self.recipients),
            max_per_tx: self.max_per_tx,
            total_budget: self.total_budget,
            spent: self.spent,
            expires_at: self.expires_at,
            active: self.active,
        }
    }
    pub fn apply(&mut self, c: &velfi_core::Mandate) {
        self.spent = c.spent;
        self.active = c.active;
    }
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub sender: Pubkey,
    pub claim_authority: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub id: u64,
    pub bump: u8,
    pub amount: u64,
    pub expires_at: i64,
    pub active: bool,
}

impl EscrowState {
    pub fn to_core(&self) -> velfi_core::Escrow {
        velfi_core::Escrow { sender: k(&self.sender), claim_authority: k(&self.claim_authority), amount: self.amount, expires_at: self.expires_at, active: self.active }
    }
}

#[account]
#[derive(InitSpace)]
pub struct StreamState {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub id: u64,
    pub bump: u8,
    pub total: u64,
    pub claimed: u64,
    pub start: i64,
    pub end: i64,
    pub active: bool,
}

impl StreamState {
    pub fn to_core(&self) -> velfi_core::Stream {
        velfi_core::Stream { sender: k(&self.sender), recipient: k(&self.recipient), total: self.total, claimed: self.claimed, start: self.start, end: self.end, active: self.active }
    }
    pub fn apply(&mut self, c: &velfi_core::Stream) {
        self.claimed = c.claimed;
        self.active = c.active;
    }
}

#[account]
#[derive(InitSpace)]
pub struct SplitStreamState {
    pub sender: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub id: u64,
    pub bump: u8,
    #[max_len(10)]
    pub recipients: Vec<Pubkey>,
    #[max_len(10)]
    pub claimed: Vec<u64>,
    pub per_person: u64,
    pub start: i64,
    pub end: i64,
    pub stopped: bool,
    pub stopped_at: i64,
}

impl SplitStreamState {
    pub fn to_core(&self) -> velfi_core::SplitStream {
        velfi_core::SplitStream {
            sender: k(&self.sender),
            recipients: keys(&self.recipients),
            claimed: self.claimed.clone(),
            per_person: self.per_person,
            start: self.start,
            end: self.end,
            stopped_at: self.stopped.then_some(self.stopped_at),
        }
    }
    pub fn apply(&mut self, c: &velfi_core::SplitStream) {
        self.claimed = c.claimed.clone();
        self.stopped = c.stopped_at.is_some();
        self.stopped_at = c.stopped_at.unwrap_or(0);
    }
}

#[account]
#[derive(InitSpace)]
pub struct SafePayState {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub id: u64,
    pub bump: u8,
    pub amount: u64,
    pub sender_confirmed: bool,
    pub recipient_confirmed: bool,
    pub deadline: i64,
    pub active: bool,
}

impl SafePayState {
    pub fn to_core(&self) -> velfi_core::SafePay {
        velfi_core::SafePay {
            sender: k(&self.sender),
            recipient: k(&self.recipient),
            amount: self.amount,
            sender_confirmed: self.sender_confirmed,
            recipient_confirmed: self.recipient_confirmed,
            deadline: self.deadline,
            active: self.active,
        }
    }
    pub fn apply(&mut self, c: &velfi_core::SafePay) {
        self.sender_confirmed = c.sender_confirmed;
        self.recipient_confirmed = c.recipient_confirmed;
        self.active = c.active;
    }
}

#[account]
#[derive(InitSpace)]
pub struct StagePayState {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub id: u64,
    pub bump: u8,
    #[max_len(10)]
    pub stages: Vec<u64>,
    pub current: u8,
    pub active: bool,
}

impl StagePayState {
    pub fn to_core(&self) -> velfi_core::StagePay {
        velfi_core::StagePay { sender: k(&self.sender), recipient: k(&self.recipient), stages: self.stages.clone(), current: self.current, active: self.active }
    }
    pub fn apply(&mut self, c: &velfi_core::StagePay) {
        self.current = c.current;
        self.active = c.active;
    }
}

/// One event for every token movement, so the backend can build Activity.
#[event]
pub struct FlowEvent {
    /// 0 mandate, 1 escrow, 2 stream, 3 split, 4 safepay, 5 stagepay
    pub kind: u8,
    /// 0 created, 1 paid, 2 refunded, 3 closed
    pub action: u8,
    pub flow: Pubkey,
    pub party: Pubkey,
    pub amount: u64,
}
