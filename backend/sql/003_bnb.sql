-- Velfi on BNB Chain: run once in the Supabase SQL editor (same project as Solana).
-- Additive only: the Solana columns and rows stay exactly as they are, so the
-- Solana version keeps working if you switch back.

-- Each user gets a BNB Chain (EVM) wallet next to their Solana one. Their .vel
-- name stays the same on both.
alter table users add column if not exists evm_address text unique;
create index if not exists users_evm_idx on users (evm_address);

-- Which chain each schedule, invite and stream belongs to. Everything that
-- already exists is Solana; the BNB backend only ever touches 'bnb' rows.
alter table scheduled_payments add column if not exists chain text not null default 'solana';
alter table escrow_invites add column if not exists chain text not null default 'solana';
alter table streams add column if not exists chain text not null default 'solana';
create index if not exists scheduled_payments_chain_due_idx on scheduled_payments (chain, status, next_run_at);
create index if not exists escrow_invites_chain_idx on escrow_invites (chain, status, to_email);
