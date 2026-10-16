-- Velfi on Solana: run once in the Supabase SQL editor.
-- Additive only: old Sui columns stay, so nothing existing breaks.

-- Users sign in with Privy (Google) and get a Solana wallet.
alter table users add column if not exists privy_id text unique;
alter table users add column if not exists wallet_address text unique;
create index if not exists users_wallet_idx on users (wallet_address);

-- Streams now live on-chain; keep a pointer to the stream account.
alter table streams add column if not exists flow_address text;
alter table streams add column if not exists mint text;

-- Schedules run inside an on-chain mandate.
alter table scheduled_payments add column if not exists mandate_address text;
alter table scheduled_payments add column if not exists mint text;
alter table scheduled_payments add column if not exists amount_units text;
alter table scheduled_payments add column if not exists interval_secs integer;
alter table scheduled_payments add column if not exists recipient_name text;
alter table scheduled_payments add column if not exists tx_hash text;

-- Money sent to an email waits in an on-chain escrow until they sign up.
create table if not exists escrow_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_address text not null,
  to_email text not null,
  escrow_address text not null,
  token text not null,
  mint text not null,
  amount_units text not null,
  claim_key_sealed text not null,        -- AES-GCM sealed with ESCROW_SECRET; never readable by the app
  status text not null default 'pending', -- pending | claimed | refunded
  claimed_by text,
  claim_tx text,
  tx_hash text,
  expires_at timestamptz not null
);
create index if not exists escrow_invites_email_idx on escrow_invites (to_email, status);

-- Only the backend (service role) may read invites: they hold sealed claim keys.
alter table escrow_invites enable row level security;
