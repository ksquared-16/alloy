-- ============================================================================================
-- WHOSE CARD IS THIS — the question a saved payment method could not answer.
--
-- `customer_payment_methods` is HOUSEHOLD grain: `customer_id`, a Stripe token, brand, last4,
-- `is_default`. It has no owner, so a stored instrument belongs to an ACCOUNT rather than to a
-- person, and every adult linked to that account is implicitly equally entitled to it. In a family
-- where Mom and Dad both pay, that is not a gap in convenience — it is Dad's card being offered to
-- Mom, and it is the reason this slice exists.
--
-- It is also short of almost everything a reusable instrument needs: no `org_id` (isolation rests
-- entirely on traversing `customers`), no rail, no status, no verification or mandate state, no
-- provider customer reference, and no lifecycle or actor columns. It cannot express a revoked card
-- or an ACH mandate, and its unique constraint is `(customer_id, stripe_payment_method_id)` —
-- account-scoped, so it could not hold the same token for two different owners even in principle.
--
-- So this adds the model rather than bolting eight columns onto six. The old table is NOT dropped
-- and its rows are NOT migrated into ownership.
--
-- ── WHY LEGACY ROWS ARE NOT GIVEN AN OWNER ──
--
-- Nobody recorded who owned them. The only ways to guess are the primary contact, the account
-- owner, or the first adult found — and the Director forbids exactly that, for the same reason
-- responsibility may never be inferred from being the primary contact. An unowned instrument is
-- therefore a FIRST-CLASS state: it is visible, it is not offered to any payer, and it requires an
-- explicit claim before it can be reused. `legacy_customer_payment_method_id` records the
-- provenance without asserting the fact nobody has.
--
-- ── WHAT THIS TABLE IS NOT ──
--
-- Not a credential store. No card number, no routing or account number, ever — the provider's
-- client collects those and Alloy keeps a token, which is what `customer_payment_methods` already
-- did correctly and what slice §7 of the certification audit ruled must never change.
--
-- Not an authority on money. It says who MAY reuse an instrument. It says nothing about who owes
-- anything: owning a saved card assigns no responsibility, modifies no arrangement, changes no
-- subsidy and creates no obligation. Nor does the reverse — becoming responsible grants no access
-- to another person's instrument. Those two questions are resolved independently, and
-- `payments.payer_entity_type/id` remains the record of who actually paid.
--
-- Not an autopay authorization. Permission to REUSE an instrument when its owner chooses to pay is
-- a different grant from permission to charge it on a schedule without them. This table carries
-- the first and deliberately not the second.
-- ============================================================================================

create table if not exists public.payment_instruments (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,

    /*
     * ACCOUNT CONTEXT, not ownership. An instrument is used against a household's obligations, and
     * that is a different fact from whose instrument it is — which is the conflation this table
     * exists to undo.
     */
    customer_id uuid not null references public.customers (id) on delete restrict,

    /*
     * THE OWNER, in the vocabulary canonical payments already use.
     *
     * `payments.payer_entity_type` / `payer_entity_id` already record who actually paid, with a
     * paired-null CHECK. The same shape is reused here rather than a second payer vocabulary being
     * invented, so "who owns this instrument" and "who sent this money" are comparable facts.
     * NULL means UNOWNED — see the header; it is a real state, not missing data.
     */
    owner_entity_type text check (owner_entity_type in ('person')),
    owner_entity_id uuid,
    constraint payment_instruments_owner_paired
        check ((owner_entity_type is null) = (owner_entity_id is null)),

    -- PROVIDER EXECUTION AND EVIDENCE. Stripe executes; Alloy is never the financial authority.
    provider text not null default 'stripe' check (provider in ('stripe')),
    /** The provider's own customer/account handle, so a token is resolved in the right scope. */
    provider_customer_ref text,
    /** The token. A reference to a credential the provider holds — never a credential. */
    provider_instrument_ref text not null,

    rail text not null check (rail in ('card', 'us_bank_account')),

    /*
     * REUSABLE IS NOT ASSUMED. A one-time instrument — Grandma paying once and saving nothing — is
     * representable here without ever becoming something another payer could be offered later.
     */
    reusable boolean not null default false,

    status text not null default 'active'
        check (status in ('active', 'unverified', 'revoked', 'expired')),

    /*
     * ACH IS NOT A CARD. A bank debit needs a mandate the account holder granted, and a card does
     * not. Null for a card; for `us_bank_account` it records where verification actually got to,
     * so nothing can present an unverified bank account as reusable.
     */
    verification_state text
        check (verification_state in ('pending', 'verified', 'failed', 'mandate_required')),
    mandate_reference text,
    mandate_accepted_at timestamptz,

    -- Display only. Enough for a payer to recognise their own instrument, and no more.
    brand text,
    last4 text,

    /** Provenance for a row that predates ownership. Never an assertion of who owns it. */
    legacy_customer_payment_method_id uuid,

    created_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    revoked_at timestamptz,
    revoked_by uuid
);

/*
 * ONE TOKEN, ONE ROW, PER ORGANISATION.
 *
 * Scoped to the org and the token rather than to the account: the same provider instrument must not
 * appear twice, and scoping the constraint to `customer_id` (as the legacy table did) would have
 * permitted exactly that across two accounts.
 */
create unique index if not exists payment_instruments_provider_ref_key
    on public.payment_instruments (org_id, provider, provider_instrument_ref);

create index if not exists payment_instruments_owner_idx
    on public.payment_instruments (org_id, owner_entity_type, owner_entity_id)
    where owner_entity_id is not null;

create index if not exists payment_instruments_account_idx
    on public.payment_instruments (org_id, customer_id);

/*
 * AN UNVERIFIED BANK ACCOUNT IS NOT REUSABLE.
 *
 * Asserted by the database because the alternative is every reader remembering it. A card carries
 * no verification state and is unaffected.
 */
alter table public.payment_instruments
    drop constraint if exists payment_instruments_ach_reuse_requires_verification;
alter table public.payment_instruments
    add constraint payment_instruments_ach_reuse_requires_verification
    check (
        rail <> 'us_bank_account'
        or reusable is false
        or verification_state = 'verified'
    );

/*
 * AN UNOWNED INSTRUMENT IS NOT REUSABLE EITHER.
 *
 * Reuse means offering it to a payer, and there is no payer to offer it to until somebody owns it.
 * This is what keeps a legacy row from becoming silently available.
 */
alter table public.payment_instruments
    drop constraint if exists payment_instruments_reuse_requires_owner;
alter table public.payment_instruments
    add constraint payment_instruments_reuse_requires_owner
    check (reusable is false or owner_entity_id is not null);

alter table public.payment_instruments enable row level security;

/*
 * NO PARTICIPANT REACHES THIS TABLE DIRECTLY.
 *
 * A participant's access is payer-scoped and decided by server code that knows who the payer is; a
 * row-level policy cannot express "this person, on this link, for this household" without turning a
 * token into a database identity. Operators read through their org role. Everything else is denied,
 * and the grants are revoked rather than left to RLS alone — a default privilege on a new public
 * table is how `authenticated` quietly acquires SELECT.
 */
revoke all on table public.payment_instruments from anon;
revoke all on table public.payment_instruments from authenticated;

drop policy if exists payment_instruments_select_org on public.payment_instruments;
create policy payment_instruments_select_org on public.payment_instruments
    for select using (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.org_id = payment_instruments.org_id
        )
    );

drop policy if exists payment_instruments_mutate_ops on public.payment_instruments;
create policy payment_instruments_mutate_ops on public.payment_instruments
    for all using (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.org_id = payment_instruments.org_id
              and ur.role = any (array['owner', 'admin', 'ops'])
        )
    );

drop policy if exists payment_instruments_service_all on public.payment_instruments;
create policy payment_instruments_service_all on public.payment_instruments
    for all using (auth.role() = 'service_role');

comment on table public.payment_instruments is
    'A reusable or one-time payment instrument, owned by an explicit payer. The owner says who MAY '
    'reuse it and nothing about who owes anything: owning an instrument assigns no responsibility, '
    'and being responsible grants no access to another person''s instrument. A null owner means '
    'UNOWNED — a first-class state for rows that predate ownership, which are never offered to a '
    'payer and never silently assigned to the primary contact. Holds a provider token, never a '
    'credential.';

comment on column public.payment_instruments.owner_entity_type is
    'Reuses the vocabulary of payments.payer_entity_type so instrument ownership and actual payer '
    'are comparable facts rather than two invented models. Null with owner_entity_id means unowned.';

comment on column public.payment_instruments.reusable is
    'Whether this instrument may be offered to its owner again later. Distinct from autopay: '
    'permission to reuse when the owner chooses to pay is not permission to charge on a schedule.';

comment on column public.payment_instruments.legacy_customer_payment_method_id is
    'Provenance for a household-grain row from customer_payment_methods. Records where the row came '
    'from; asserts nothing about who owns it, because nobody recorded that.';
