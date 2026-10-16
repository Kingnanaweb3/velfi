use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::{core_err, ErrorCode};
use crate::state::*;
use crate::util::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct StartSplitStream<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init, payer = payer, space = 8 + SplitStreamState::INIT_SPACE,
        seeds = [SPLIT_SEED, sender.key().as_ref(), &id.to_le_bytes()], bump
    )]
    pub split: Account<'info, SplitStreamState>,
    #[account(init, payer = payer, associated_token::mint = mint, associated_token::authority = split, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Deposits per_person × n; any remainder of `total` stays with the sender.
pub fn start(ctx: Context<StartSplitStream>, id: u64, recipients: Vec<Pubkey>, total: u64, duration: i64) -> Result<()> {
    let (rules, deposit_amount) = velfi_core::SplitStream::new(k(&ctx.accounts.sender.key()), keys(&recipients), total, now()?, duration).map_err(core_err)?;
    let s = &mut ctx.accounts.split;
    s.sender = ctx.accounts.sender.key();
    s.mint = ctx.accounts.mint.key();
    s.rent_payer = ctx.accounts.payer.key();
    s.id = id;
    s.bump = ctx.bumps.split;
    s.claimed = vec![0; recipients.len()];
    s.recipients = recipients;
    s.per_person = rules.per_person;
    s.start = rules.start;
    s.end = rules.end;
    s.stopped = false;
    s.stopped_at = 0;
    let a = &ctx.accounts;
    deposit(&a.token_program, &a.sender_token, &a.mint, &a.vault, a.sender.to_account_info(), deposit_amount)?;
    emit!(FlowEvent { kind: 3, action: 0, flow: a.split.key(), party: a.sender.key(), amount: deposit_amount });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimSplitStream<'info> {
    pub claimer: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub split: Account<'info, SplitStreamState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = split, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = claimer, associated_token::token_program = token_program)]
    pub claimer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<ClaimSplitStream>) -> Result<()> {
    let mut rules = ctx.accounts.split.to_core();
    let p = rules.claim(k(&ctx.accounts.claimer.key()), now()?).map_err(core_err)?;
    ctx.accounts.split.apply(&rules);

    let s = &ctx.accounts.split;
    let (sender, id, bump) = (s.sender, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[SPLIT_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.claimer_token, a.split.to_account_info(), seeds, p.amount)?;
    emit!(FlowEvent { kind: 3, action: 1, flow: a.split.key(), party: a.claimer.key(), amount: p.amount });
    Ok(())
}

#[derive(Accounts)]
pub struct StopSplitStream<'info> {
    pub sender: Signer<'info>,
    #[account(mut, has_one = sender, has_one = mint)]
    pub split: Account<'info, SplitStreamState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = split, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Freezes vesting now; recipients keep (and can still claim) what vested.
pub fn stop(ctx: Context<StopSplitStream>) -> Result<()> {
    let mut rules = ctx.accounts.split.to_core();
    let refund = rules.stop(k(&ctx.accounts.sender.key()), now()?).map_err(core_err)?;
    ctx.accounts.split.apply(&rules);

    let s = &ctx.accounts.split;
    let (sender, id, bump) = (s.sender, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[SPLIT_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    if let Some(p) = refund {
        pay_out(&a.token_program, &a.vault, &a.mint, &a.sender_token, a.split.to_account_info(), seeds, p.amount)?;
        emit!(FlowEvent { kind: 3, action: 2, flow: a.split.key(), party: sender, amount: p.amount });
    }
    Ok(())
}

#[derive(Accounts)]
pub struct CloseSplitStream<'info> {
    pub sender: Signer<'info>,
    #[account(mut, has_one = sender, has_one = mint)]
    pub split: Account<'info, SplitStreamState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = split, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back.
    #[account(mut, address = split.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Once vesting is over (or stopped) and every share has been claimed, the
/// sender closes the split, sweeping any stray tokens back and freeing rent.
pub fn close(ctx: Context<CloseSplitStream>) -> Result<()> {
    let rules = ctx.accounts.split.to_core();
    require!(rules.is_finished(now()?), ErrorCode::NotFinished);

    let s = &ctx.accounts.split;
    let (sender, id, bump) = (s.sender, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[SPLIT_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    let stray = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.sender_token, a.split.to_account_info(), seeds, stray)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.split.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 3, action: 3, flow: a.split.key(), party: sender, amount: stray });
    ctx.accounts.split.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}
