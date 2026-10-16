use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::{core_err, ErrorCode};
use crate::state::*;
use crate::util::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateEscrow<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init, payer = payer, space = 8 + EscrowState::INIT_SPACE,
        seeds = [ESCROW_SEED, sender.key().as_ref(), &id.to_le_bytes()], bump
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(init, payer = payer, associated_token::mint = mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// `claim_authority` is the public key of a fresh keypair whose secret goes in
/// the claim link. `window` is seconds until the sender may refund (0 = 3 days).
pub fn create(ctx: Context<CreateEscrow>, id: u64, amount: u64, claim_authority: Pubkey, window: i64) -> Result<()> {
    let rules = velfi_core::Escrow::new(k(&ctx.accounts.sender.key()), k(&claim_authority), amount, now()?, window).map_err(core_err)?;
    let e = &mut ctx.accounts.escrow;
    e.sender = ctx.accounts.sender.key();
    e.claim_authority = claim_authority;
    e.mint = ctx.accounts.mint.key();
    e.rent_payer = ctx.accounts.payer.key();
    e.id = id;
    e.bump = ctx.bumps.escrow;
    e.amount = amount;
    e.expires_at = rules.expires_at;
    e.active = true;
    let a = &ctx.accounts;
    deposit(&a.token_program, &a.sender_token, &a.mint, &a.vault, a.sender.to_account_info(), amount)?;
    emit!(FlowEvent { kind: 1, action: 0, flow: a.escrow.key(), party: a.sender.key(), amount });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimEscrow<'info> {
    /// The keypair from the claim link.
    pub claim_authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = mint, has_one = claim_authority)]
    pub escrow: Account<'info, EscrowState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the wallet the claimer wants the funds in.
    pub claimer: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = claimer, associated_token::token_program = token_program)]
    pub claimer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back.
    #[account(mut, address = escrow.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<ClaimEscrow>) -> Result<()> {
    let mut rules = ctx.accounts.escrow.to_core();
    rules.claim(k(&ctx.accounts.claim_authority.key()), k(&ctx.accounts.claimer.key()), now()?).map_err(core_err)?;
    ctx.accounts.escrow.active = false;

    let e = &ctx.accounts.escrow;
    let (sender, id, bump) = (e.sender, e.id.to_le_bytes(), [e.bump]);
    let seeds: &[&[u8]] = &[ESCROW_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    let amount = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.claimer_token, a.escrow.to_account_info(), seeds, amount)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.escrow.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 1, action: 1, flow: a.escrow.key(), party: a.claimer.key(), amount });
    ctx.accounts.escrow.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    pub sender: Signer<'info>,
    #[account(mut, has_one = sender, has_one = mint)]
    pub escrow: Account<'info, EscrowState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back.
    #[account(mut, address = escrow.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn refund(ctx: Context<RefundEscrow>) -> Result<()> {
    let mut rules = ctx.accounts.escrow.to_core();
    rules.refund(k(&ctx.accounts.sender.key()), now()?).map_err(core_err)?;
    ctx.accounts.escrow.active = false;

    let e = &ctx.accounts.escrow;
    let (sender, id, bump) = (e.sender, e.id.to_le_bytes(), [e.bump]);
    let seeds: &[&[u8]] = &[ESCROW_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    let amount = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.sender_token, a.escrow.to_account_info(), seeds, amount)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.escrow.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 1, action: 2, flow: a.escrow.key(), party: sender, amount });
    ctx.accounts.escrow.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}
