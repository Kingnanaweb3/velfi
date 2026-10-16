use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::{core_err, ErrorCode};
use crate::state::*;
use crate::util::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct StartStream<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init, payer = payer, space = 8 + StreamState::INIT_SPACE,
        seeds = [STREAM_SEED, sender.key().as_ref(), &id.to_le_bytes()], bump
    )]
    pub stream: Account<'info, StreamState>,
    #[account(init, payer = payer, associated_token::mint = mint, associated_token::authority = stream, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn start(ctx: Context<StartStream>, id: u64, recipient: Pubkey, amount: u64, duration: i64) -> Result<()> {
    let rules = velfi_core::Stream::new(k(&ctx.accounts.sender.key()), k(&recipient), amount, now()?, duration).map_err(core_err)?;
    let s = &mut ctx.accounts.stream;
    s.sender = ctx.accounts.sender.key();
    s.recipient = recipient;
    s.mint = ctx.accounts.mint.key();
    s.rent_payer = ctx.accounts.payer.key();
    s.id = id;
    s.bump = ctx.bumps.stream;
    s.total = amount;
    s.claimed = 0;
    s.start = rules.start;
    s.end = rules.end;
    s.active = true;
    let a = &ctx.accounts;
    deposit(&a.token_program, &a.sender_token, &a.mint, &a.vault, a.sender.to_account_info(), amount)?;
    emit!(FlowEvent { kind: 2, action: 0, flow: a.stream.key(), party: a.sender.key(), amount });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimStream<'info> {
    pub recipient: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = recipient, has_one = mint)]
    pub stream: Account<'info, StreamState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = stream, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = recipient, associated_token::token_program = token_program)]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back when the stream finishes.
    #[account(mut, address = stream.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<ClaimStream>) -> Result<()> {
    let mut rules = ctx.accounts.stream.to_core();
    let p = rules.claim(k(&ctx.accounts.recipient.key()), now()?).map_err(core_err)?;
    ctx.accounts.stream.apply(&rules);

    let s = &ctx.accounts.stream;
    let (sender, id, bump, finished) = (s.sender, s.id.to_le_bytes(), [s.bump], !s.active);
    let seeds: &[&[u8]] = &[STREAM_SEED, sender.as_ref(), &id, &bump];
    let a = &mut ctx.accounts;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.recipient_token, a.stream.to_account_info(), seeds, p.amount)?;
    emit!(FlowEvent { kind: 2, action: 1, flow: a.stream.key(), party: a.recipient.key(), amount: p.amount });
    if finished {
        a.vault.reload()?;
        if a.vault.amount == 0 {
            close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.stream.to_account_info(), seeds)?;
            a.stream.close(a.rent_payer.to_account_info())?;
        }
    }
    Ok(())
}

#[derive(Accounts)]
pub struct StopStream<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = sender, has_one = recipient, has_one = mint)]
    pub stream: Account<'info, StreamState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = stream, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the stream's recipient (enforced by has_one).
    pub recipient: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = recipient, associated_token::token_program = token_program)]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back.
    #[account(mut, address = stream.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn stop(ctx: Context<StopStream>) -> Result<()> {
    let mut rules = ctx.accounts.stream.to_core();
    let payouts = rules.stop(k(&ctx.accounts.sender.key()), now()?).map_err(core_err)?;
    ctx.accounts.stream.apply(&rules);

    let s = &ctx.accounts.stream;
    let (sender, recipient, id, bump) = (s.sender, s.recipient, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[STREAM_SEED, sender.as_ref(), &id, &bump];
    let a = &mut ctx.accounts;
    for p in &payouts {
        if pk(p.to) == recipient {
            pay_out(&a.token_program, &a.vault, &a.mint, &a.recipient_token, a.stream.to_account_info(), seeds, p.amount)?;
            emit!(FlowEvent { kind: 2, action: 1, flow: a.stream.key(), party: recipient, amount: p.amount });
        }
    }
    // Everything else in the vault goes back to the sender, then both accounts close.
    a.vault.reload()?;
    let refund = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.sender_token, a.stream.to_account_info(), seeds, refund)?;
    emit!(FlowEvent { kind: 2, action: 2, flow: a.stream.key(), party: sender, amount: refund });
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.stream.to_account_info(), seeds)?;
    a.stream.close(a.rent_payer.to_account_info())?;
    Ok(())
}
