use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::{core_err, ErrorCode};
use crate::state::*;
use crate::util::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateStagePay<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init, payer = payer, space = 8 + StagePayState::INIT_SPACE,
        seeds = [STAGE_SEED, sender.key().as_ref(), &id.to_le_bytes()], bump
    )]
    pub stage_pay: Account<'info, StagePayState>,
    #[account(init, payer = payer, associated_token::mint = mint, associated_token::authority = stage_pay, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create(ctx: Context<CreateStagePay>, id: u64, recipient: Pubkey, stages: Vec<u64>) -> Result<()> {
    let (_, total) = velfi_core::StagePay::new(k(&ctx.accounts.sender.key()), k(&recipient), stages.clone()).map_err(core_err)?;
    let s = &mut ctx.accounts.stage_pay;
    s.sender = ctx.accounts.sender.key();
    s.recipient = recipient;
    s.mint = ctx.accounts.mint.key();
    s.rent_payer = ctx.accounts.payer.key();
    s.id = id;
    s.bump = ctx.bumps.stage_pay;
    s.stages = stages;
    s.current = 0;
    s.active = true;
    let a = &ctx.accounts;
    deposit(&a.token_program, &a.sender_token, &a.mint, &a.vault, a.sender.to_account_info(), total)?;
    emit!(FlowEvent { kind: 5, action: 0, flow: a.stage_pay.key(), party: a.sender.key(), amount: total });
    Ok(())
}

#[derive(Accounts)]
pub struct ReleaseStage<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = sender, has_one = recipient, has_one = mint)]
    pub stage_pay: Account<'info, StagePayState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = stage_pay, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the plan's recipient (enforced by has_one).
    pub recipient: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = recipient, associated_token::token_program = token_program)]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back after the last stage.
    #[account(mut, address = stage_pay.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn release(ctx: Context<ReleaseStage>) -> Result<()> {
    let mut rules = ctx.accounts.stage_pay.to_core();
    let p = rules.release_next(k(&ctx.accounts.sender.key())).map_err(core_err)?;
    ctx.accounts.stage_pay.apply(&rules);

    let s = &ctx.accounts.stage_pay;
    let (sender, recipient, id, bump, finished) = (s.sender, s.recipient, s.id.to_le_bytes(), [s.bump], !s.active);
    let seeds: &[&[u8]] = &[STAGE_SEED, sender.as_ref(), &id, &bump];
    let a = &mut ctx.accounts;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.recipient_token, a.stage_pay.to_account_info(), seeds, p.amount)?;
    emit!(FlowEvent { kind: 5, action: 1, flow: a.stage_pay.key(), party: recipient, amount: p.amount });
    if finished {
        a.vault.reload()?;
        if a.vault.amount == 0 {
            close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.stage_pay.to_account_info(), seeds)?;
            a.stage_pay.close(a.rent_payer.to_account_info())?;
        }
    }
    Ok(())
}

#[derive(Accounts)]
pub struct CancelStagePay<'info> {
    pub sender: Signer<'info>,
    #[account(mut, has_one = sender, has_one = mint)]
    pub stage_pay: Account<'info, StagePayState>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = stage_pay, associated_token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = sender, token::token_program = token_program)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: receives the rent back.
    #[account(mut, address = stage_pay.rent_payer @ ErrorCode::WrongAccount)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn cancel(ctx: Context<CancelStagePay>) -> Result<()> {
    let mut rules = ctx.accounts.stage_pay.to_core();
    rules.cancel(k(&ctx.accounts.sender.key())).map_err(core_err)?;
    ctx.accounts.stage_pay.apply(&rules);

    let s = &ctx.accounts.stage_pay;
    let (sender, id, bump) = (s.sender, s.id.to_le_bytes(), [s.bump]);
    let seeds: &[&[u8]] = &[STAGE_SEED, sender.as_ref(), &id, &bump];
    let a = &ctx.accounts;
    let left = a.vault.amount;
    pay_out(&a.token_program, &a.vault, &a.mint, &a.sender_token, a.stage_pay.to_account_info(), seeds, left)?;
    close_vault(&a.token_program, &a.vault, a.rent_payer.to_account_info(), a.stage_pay.to_account_info(), seeds)?;
    emit!(FlowEvent { kind: 5, action: 2, flow: a.stage_pay.key(), party: sender, amount: left });
    ctx.accounts.stage_pay.close(ctx.accounts.rent_payer.to_account_info())?;
    Ok(())
}
