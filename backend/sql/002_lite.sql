-- Velfi lite mode (mainnet v1): run once in the Supabase SQL editor, after 001.
-- Additive only.

-- How each schedule is enforced: 'delegate' (lite: an allowance on the user's
-- token account) or 'mandate' (the Velfi program).
alter table scheduled_payments add column if not exists mode text;
update scheduled_payments set mode = 'mandate' where mode is null and mandate_address is not null;

-- How each email invite is held: 'wallet' (lite: a one-off claim wallet) or
-- 'program' (on-chain escrow). Status also goes through 'claiming' / 'refunding'
-- briefly while money moves.
alter table escrow_invites add column if not exists mode text not null default 'program';
create index if not exists escrow_invites_refund_idx on escrow_invites (status, mode, expires_at);
create index if not exists scheduled_payments_due_idx on scheduled_payments (status, next_run_at);


-- The browser never talks to Supabase directly (everything goes through the API
-- with the service role), so turn on RLS everywhere with no policies: the public
-- anon key can then read and write nothing. The service role is unaffected.
do $$
declare t text;
begin
  foreach t in array array['users','transactions','notifications','streams','agent_conversations',
                           'scheduled_payments','escrow_invites','pending_payments','payment_requests']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;
