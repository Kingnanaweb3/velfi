use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::{core_err, ErrorCode};
use crate::state::*;
use crate::util::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateSafePay<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init, payer = payer, space = 8 + SafePayState::INIT_SPACE,
        seeds = [SAFE_SEED, sender.key().as_ref(), &id.to_le_bytes()], bump
    )]
    pub safe_pay: Account<'info, SafePayState>,
    #[account(init, payer = payer, associated_token::mint = mint, associated_token::authority = safe_pay, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create(ctx: Context<CreateSafePay>, id: u64, recipient: Pubkey, amount: u64, window: i64) -> Result<()> {
    let rules = velfi_core::SafePay::new(k(&ctx.accounts.sender.key()), k(&recipient), amount, now()?, window).map_err(core_err)?;
    let s = &mut ctx.accounts.safe_pay;
    s.sender = ctx.accounts.sender.key();
    s.recipient = recipient;
    s.mint = ctx.accounts.mint.key();
    s.rent_payer = ctx.accounts.payer.key();
    s.id = id;
    s.bump = ctx.bumps.safe_pay;
    s.amount = amount;
    s.sender_confirmed = false;
    s.recipient_confirmed = false;
    s.deadline = rules.deadline;
    s.active = true;
    let a = &ctx.accounts;
    deposit(&a.token_program, &a.sender_token, &a.mint, &a.vault, a.sender.to_account_info(), amount)?;
    emit!(FlowEvent { kind: 4, action: 0, flow: a.safe_pay.key(), party: a.sender.key(), amount });
    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmSafePay<'info> {
    /// The sender or the recipient.
    pub caller: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = recipient, has_one = mint)]
    pub safe_pay: Account<'info, SafePayState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = safe_pay, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the SafePay's recipient (enforced by has_one).
    pub recipient: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = recipient, associated_token::token_program = token_program)]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back on release.
    #[account(mut, address = safe_pay.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn confirm(ctx: Context<ConfirmSafePay>) -> Result<()> {
    let mut rules = ctx.accounts.safe_pay.to_core();
    let release = rules.confirm(k(&ctx.accounts.caller.key())).map_err(core_err)?;
    ctx.accounts.safe_pay.apply(&rules);
    if release.is_none() {
        return Ok(());
    }
    let s = &ctx.accounts.safe_pay;
    let (sender, recipient, id, bump) = (s.sender, s.recipient, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[SAFE_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    let amount = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.recipient_token, a.safe_pay.to_account_info(), seeds, amount)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.safe_pay.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 4, action: 1, flow: a.safe_pay.key(), party: recipient, amount });
    ctx.accounts.safe_pay.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}

#[derive(Accounts)]
pub struct ReclaimSafePay<'info> {
    pub sender: Signer<'info>,
    #[account(mut, has_one = sender, has_one = mint)]
    pub safe_pay: Account<'info, SafePayState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = safe_pay, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back.
    #[account(mut, address = safe_pay.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn reclaim(ctx: Context<ReclaimSafePay>) -> Result<()> {
    let mut rules = ctx.accounts.safe_pay.to_core();
    rules.reclaim(k(&ctx.accounts.sender.key()), now()?).map_err(core_err)?;
    ctx.accounts.safe_pay.apply(&rules);

    let s = &ctx.accounts.safe_pay;
    let (sender, id, bump) = (s.sender, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[SAFE_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    let amount = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.sender_token, a.safe_pay.to_account_info(), seeds, amount)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.safe_pay.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 4, action: 2, flow: a.safe_pay.key(), party: sender, amount });
    ctx.accounts.safe_pay.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}
