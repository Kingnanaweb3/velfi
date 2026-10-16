use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::{core_err, ErrorCode};
use crate::state::*;
use crate::util::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateMandate<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init, payer = payer, space = 8 + MandateState::INIT_SPACE,
        seeds = [MANDATE_SEED, owner.key().as_ref(), &id.to_le_bytes()], bump
    )]
    pub mandate: Account<'info, MandateState>,
    #[account(
        init, payer = payer,
        associated_token::mint = mint, associated_token::authority = mandate, associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create(ctx: Context<CreateMandate>, id: u64, agent: Pubkey, recipients: Vec<Pubkey>, max_per_tx: u64, total_budget: u64, duration: i64) -> Result<()> {
    let rules = velfi_core::Mandate::new(k(&ctx.accounts.owner.key()), k(&agent), keys(&recipients), max_per_tx, total_budget, now()?, duration).map_err(core_err)?;
    let m = &mut ctx.accounts.mandate;
    m.owner = ctx.accounts.owner.key();
    m.agent = agent;
    m.mint = ctx.accounts.mint.key();
    m.rent_payer = ctx.accounts.payer.key();
    m.id = id;
    m.bump = ctx.bumps.mandate;
    m.recipients = recipients;
    m.max_per_tx = rules.max_per_tx;
    m.total_budget = rules.total_budget;
    m.spent = 0;
    m.expires_at = rules.expires_at;
    m.active = true;
    let a = &ctx.accounts;
    deposit(&a.token_program, &a.owner_token, &a.mint, &a.vault, a.owner.to_account_info(), total_budget)?;
    emit!(FlowEvent { kind: 0, action: 0, flow: a.mandate.key(), party: a.owner.key(), amount: total_budget });
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteMandate<'info> {
    /// The agent (Autopilot) or the owner.
    pub caller: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub mandate: Account<'info, MandateState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = mandate, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: wallet that receives the payment; checked against the allowlist by velfi-core.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        init_if_needed, payer = payer,
        associated_token::mint = mint, associated_token::authority = recipient, associated_token::token_program = token_program
    )]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn execute(ctx: Context<ExecuteMandate>, amount: u64) -> Result<()> {
    let mut rules = ctx.accounts.mandate.to_core();
    let p = rules.execute(k(&ctx.accounts.caller.key()), amount, k(&ctx.accounts.recipient.key()), now()?).map_err(core_err)?;
    require_keys_eq!(pk(p.to), ctx.accounts.recipient.key(), ErrorCode::WrongAccount);
    ctx.accounts.mandate.apply(&rules);

    let m = &ctx.accounts.mandate;
    let (owner, id, bump) = (m.owner, m.id.to_le_bytes(), [m.bump]);
    let seeds: &[&[u8]] = &[MANDATE_SEED, owner.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.recipient_token, a.mandate.to_account_info(), seeds, p.amount)?;
    emit!(FlowEvent { kind: 0, action: 1, flow: a.mandate.key(), party: pk(p.to), amount: p.amount });
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeMandate<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, has_one = mint)]
    pub mandate: Account<'info, MandateState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = mandate, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back; must be whoever paid it.
    #[account(mut, address = mandate.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn revoke(ctx: Context<RevokeMandate>) -> Result<()> {
    let mut rules = ctx.accounts.mandate.to_core();
    rules.revoke(k(&ctx.accounts.owner.key())).map_err(core_err)?;
    ctx.accounts.mandate.apply(&rules);

    let m = &ctx.accounts.mandate;
    let (owner, id, bump) = (m.owner, m.id.to_le_bytes(), [m.bump]);
    let seeds: &[&[u8]] = &[MANDATE_SEED, owner.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    // Refund the whole vault (including anything sent to it by mistake) so it can close.
    let left = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.owner_token, a.mandate.to_account_info(), seeds, left)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.mandate.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 0, action: 2, flow: a.mandate.key(), party: owner, amount: left });
    ctx.accounts.mandate.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}
