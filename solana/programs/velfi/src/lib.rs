//! Velfi on Solana.
//!
//! Every money rule lives in `velfi-core` (pure Rust, unit tested). This
//! program only does the Solana parts: accounts, PDAs, token vaults and
//! transfers. Each flow keeps its tokens in a vault (an associated token
//! account owned by the flow's PDA). Rent is paid by `payer` (Velfi's fee
//! payer for gasless use, or the user) and is refunded to it when a flow ends.
use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod util;

pub use instructions::*;

// Replace with your own: run `anchor keys sync` once after cloning.
declare_id!("HeWZC7G6oYzfZfta67YVYvuySgQqKXJDs4ypghxXAajJ");

#[program]
pub mod velfi {
    use super::*;

    // ── Guardrail mandates (Autopilot budgets) ──
    pub fn create_mandate(ctx: Context<CreateMandate>, id: u64, agent: Pubkey, recipients: Vec<Pubkey>, max_per_tx: u64, total_budget: u64, duration: i64) -> Result<()> {
        mandate::create(ctx, id, agent, recipients, max_per_tx, total_budget, duration)
    }
    pub fn execute_mandate(ctx: Context<ExecuteMandate>, amount: u64) -> Result<()> {
        mandate::execute(ctx, amount)
    }
    pub fn revoke_mandate(ctx: Context<RevokeMandate>) -> Result<()> {
        mandate::revoke(ctx)
    }

    // ── Claim-link escrow (send to an email or a new user) ──
    pub fn create_escrow(ctx: Context<CreateEscrow>, id: u64, amount: u64, claim_authority: Pubkey, window: i64) -> Result<()> {
        escrow::create(ctx, id, amount, claim_authority, window)
    }
    pub fn claim_escrow(ctx: Context<ClaimEscrow>) -> Result<()> {
        escrow::claim(ctx)
    }
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        escrow::refund(ctx)
    }

    // ── Streams ──
    pub fn start_stream(ctx: Context<StartStream>, id: u64, recipient: Pubkey, amount: u64, duration: i64) -> Result<()> {
        stream::start(ctx, id, recipient, amount, duration)
    }
    pub fn claim_stream(ctx: Context<ClaimStream>) -> Result<()> {
        stream::claim(ctx)
    }
    pub fn stop_stream(ctx: Context<StopStream>) -> Result<()> {
        stream::stop(ctx)
    }

    // ── Split streams ──
    pub fn start_split_stream(ctx: Context<StartSplitStream>, id: u64, recipients: Vec<Pubkey>, total: u64, duration: i64) -> Result<()> {
        split::start(ctx, id, recipients, total, duration)
    }
    pub fn claim_split_stream(ctx: Context<ClaimSplitStream>) -> Result<()> {
        split::claim(ctx)
    }
    pub fn stop_split_stream(ctx: Context<StopSplitStream>) -> Result<()> {
        split::stop(ctx)
    }
    pub fn close_split_stream(ctx: Context<CloseSplitStream>) -> Result<()> {
        split::close(ctx)
    }

    // ── SafePay (both sides confirm) ──
    pub fn create_safe_pay(ctx: Context<CreateSafePay>, id: u64, recipient: Pubkey, amount: u64, window: i64) -> Result<()> {
        safe_pay::create(ctx, id, recipient, amount, window)
    }
    pub fn confirm_safe_pay(ctx: Context<ConfirmSafePay>) -> Result<()> {
        safe_pay::confirm(ctx)
    }
    pub fn reclaim_safe_pay(ctx: Context<ReclaimSafePay>) -> Result<()> {
        safe_pay::reclaim(ctx)
    }

    // ── Staged pay (milestones) ──
    pub fn create_stage_pay(ctx: Context<CreateStagePay>, id: u64, recipient: Pubkey, stages: Vec<u64>) -> Result<()> {
        stage_pay::create(ctx, id, recipient, stages)
    }
    pub fn release_stage(ctx: Context<ReleaseStage>) -> Result<()> {
        stage_pay::release(ctx)
    }
    pub fn cancel_stage_pay(ctx: Context<CancelStagePay>) -> Result<()> {
        stage_pay::cancel(ctx)
    }
}
