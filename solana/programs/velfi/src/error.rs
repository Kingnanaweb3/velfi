use anchor_lang::prelude::*;
use velfi_core::VelfiError;

#[error_code]
pub enum ErrorCode {
    #[msg("This flow is no longer active")]
    NotActive,
    #[msg("Only the owner can do this")]
    NotOwner,
    #[msg("Only the agent or the owner can spend from this mandate")]
    NotAuthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Add at least one recipient")]
    NoRecipients,
    #[msg("Too many recipients (max 10)")]
    TooManyRecipients,
    #[msg("A recipient is listed twice")]
    DuplicateRecipient,
    #[msg("Above the per-payment cap for this mandate")]
    OverPerTxCap,
    #[msg("Recipient is not on this mandate's allowlist")]
    RecipientNotAllowed,
    #[msg("Not enough budget left in this mandate")]
    InsufficientBudget,
    #[msg("This has expired")]
    Expired,
    #[msg("Not expired yet")]
    NotExpired,
    #[msg("Wrong claim key")]
    WrongClaimer,
    #[msg("Only the recipient can do this")]
    NotRecipient,
    #[msg("Only the sender can do this")]
    NotSender,
    #[msg("Nothing to claim right now")]
    NoFunds,
    #[msg("Already confirmed")]
    AlreadyConfirmed,
    #[msg("The deadline has not passed yet")]
    DeadlineNotPassed,
    #[msg("All stages have been released")]
    NoMoreStages,
    #[msg("Wrong number of items")]
    WrongLength,
    #[msg("Too many stages (max 10)")]
    TooManyStages,
    #[msg("Duration must be greater than zero")]
    BadDuration,
    #[msg("Already stopped")]
    AlreadyStopped,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Account does not match the flow")]
    WrongAccount,
    #[msg("This flow still has funds or claims outstanding")]
    NotFinished,
}

pub fn core_err(e: VelfiError) -> Error {
    let code = match e {
        VelfiError::NotActive => ErrorCode::NotActive,
        VelfiError::NotOwner => ErrorCode::NotOwner,
        VelfiError::NotAuthorized => ErrorCode::NotAuthorized,
        VelfiError::ZeroAmount => ErrorCode::ZeroAmount,
        VelfiError::NoRecipients => ErrorCode::NoRecipients,
        VelfiError::TooManyRecipients => ErrorCode::TooManyRecipients,
        VelfiError::DuplicateRecipient => ErrorCode::DuplicateRecipient,
        VelfiError::OverPerTxCap => ErrorCode::OverPerTxCap,
        VelfiError::RecipientNotAllowed => ErrorCode::RecipientNotAllowed,
        VelfiError::InsufficientBudget => ErrorCode::InsufficientBudget,
        VelfiError::Expired => ErrorCode::Expired,
        VelfiError::NotExpired => ErrorCode::NotExpired,
        VelfiError::WrongClaimer => ErrorCode::WrongClaimer,
        VelfiError::NotRecipient => ErrorCode::NotRecipient,
        VelfiError::NotSender => ErrorCode::NotSender,
        VelfiError::NoFunds => ErrorCode::NoFunds,
        VelfiError::AlreadyConfirmed => ErrorCode::AlreadyConfirmed,
        VelfiError::DeadlineNotPassed => ErrorCode::DeadlineNotPassed,
        VelfiError::NoMoreStages => ErrorCode::NoMoreStages,
        VelfiError::WrongLength => ErrorCode::WrongLength,
        VelfiError::TooManyStages => ErrorCode::TooManyStages,
        VelfiError::BadDuration => ErrorCode::BadDuration,
        VelfiError::AlreadyStopped => ErrorCode::AlreadyStopped,
        VelfiError::MathOverflow => ErrorCode::MathOverflow,
    };
    code.into()
}
