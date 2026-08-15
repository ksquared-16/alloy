-- Where mail is DELIVERED, separated from the address a family SEES.
--
-- ---------------------------------------------------------------------------
-- THE TWO CONCEPTS, AND WHY ONE COLUMN CANNOT HOLD BOTH
-- ---------------------------------------------------------------------------
--
--   VISIBLE IDENTITY    communication_provider_bindings.inbound_address
--                       kelly@workwithalloy.com
--                       What the organization communicates as. The `From` on a
--                       parent's screen, the address their Reply targets, the
--                       address the operator is told is theirs.
--
--   INGRESS DESTINATION communication_ingress_routes.destination
--                       <opaque>@<id>.resend.app
--                       Where mail addressed to the visible identity is
--                       administratively routed so Alloy can observe it.
--                       Transport. Not anybody's address.
--
-- Today `inbound_address` does both jobs, which works only while the two happen
-- to be the same string. Under selective routing they are not: the organization
-- keeps its own MX, an address-level rule at their mail provider forwards one
-- mailbox onward, and Resend receives at an opaque destination Alloy never shows.
-- One column then has to be either the address parents reply to OR the address
-- the provider delivers to — and whichever it is, the other is wrong. That is how
-- a parent ends up looking at `a7f3c1@x9k2m4.resend.app`, or an operator is told
-- that is their email address.
--
-- So `inbound_address` KEEPS its meaning, unchanged: the organization's own
-- receiving address, the visible one. The hidden destination gets its own row.
-- Nothing about the existing direct-delivery arrangement changes and the
-- certified SMS runtime is not touched.
--
-- ---------------------------------------------------------------------------
-- WHY A ROW EXISTS EVEN WHEN NOTHING IS HIDDEN
-- ---------------------------------------------------------------------------
--
-- A route is created for direct delivery too, with `destination` equal to the
-- visible address. The concept is "where mail must arrive for Alloy to observe
-- it", and that is true of both arrangements. Keeping one concept means there is
-- exactly one place that records HAVING OBSERVED INBOUND, which is the only
-- evidence receiving actually works. Whether a destination is hidden is then a
-- property of the address (a provider ingress domain), not a second table.
--
-- ---------------------------------------------------------------------------
-- ADDITIVE ONLY
-- ---------------------------------------------------------------------------
--
-- New table, new index, one new unique index on an existing table. No destructive
-- DDL, no column dropped or narrowed, no data mutation, no backfill. Existing
-- bindings keep working with no route row: readiness reports that honestly
-- rather than assuming.

-- FIRST: the pair the route's composite foreign key needs something to point at.
-- Redundant with the primary key for uniqueness purposes, and that is fine — its
-- job is to make tenant containment structural rather than conventional. It must
-- exist BEFORE the table that references it.
create unique index if not exists communication_bindings_id_org_uq
    on public.communication_provider_bindings (id, org_id);

create table if not exists public.communication_ingress_routes (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null,
    communication_provider_binding_id uuid not null,
    channel text not null default 'email' check (channel in ('email')),

    -- The address the PROVIDER delivers to. May equal the binding's visible
    -- `inbound_address` (direct delivery) or be an opaque provider destination
    -- (selective routing). Never rendered outside administrator setup detail.
    destination text not null,

    -- What Alloy can HONESTLY say about this route.
    --
    --   routing_setup_required — a destination exists and no inbound has ever
    --                            been observed through it. An address in a
    --                            database is not evidence that an external mail
    --                            provider's forwarding rule exists.
    --   inbound_observed       — a message actually arrived here. This is the
    --                            only state that justifies telling an operator
    --                            receiving works.
    --
    -- Deliberately absent: any state meaning "we checked the external rule and
    -- it is fine". For an externally routed primary-domain identity Alloy cannot
    -- continuously prove the rule still exists, and a state claiming otherwise
    -- would be inventing certainty.
    verification_state text not null default 'routing_setup_required'
        check (verification_state in ('routing_setup_required', 'inbound_observed')),

    -- When inbound was last actually seen here. The evidence itself.
    last_inbound_at timestamptz null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint communication_ingress_routes_org_fk
        foreign key (org_id) references public.orgs (id) on delete cascade,

    -- COMPOSITE, deliberately. A plain reference to the binding's id would let a
    -- route name a binding in a DIFFERENT organization, and the tenant boundary
    -- would then rest on every writer remembering to check. Requiring the pair to
    -- match an existing (id, org_id) makes a cross-tenant route impossible to
    -- store rather than merely incorrect to write.
    constraint communication_ingress_routes_binding_fk
        foreign key (communication_provider_binding_id, org_id)
        references public.communication_provider_bindings (id, org_id) on delete cascade,

    -- The observation and the claim about it cannot disagree. `inbound_observed`
    -- without a timestamp would be a state asserting evidence it does not hold —
    -- exactly the class of lie this whole change exists to remove — so the
    -- database refuses it instead of trusting the writer.
    constraint communication_ingress_routes_observed_requires_evidence
        check (verification_state <> 'inbound_observed' or last_inbound_at is not null)
);

comment on table public.communication_ingress_routes is
    'Where inbound mail is delivered so Alloy can observe it, kept SEPARATE from the address families see and reply to. Transport metadata: never rendered outside administrator routing setup.';

comment on column public.communication_ingress_routes.destination is
    'Provider delivery destination. Equal to the binding''s visible inbound_address for direct delivery; an opaque provider address under selective routing. Never shown to a family, and never presented as an operator''s own email identity.';

comment on column public.communication_ingress_routes.verification_state is
    'routing_setup_required until inbound is actually observed here. There is deliberately no state meaning "the external forwarding rule was checked and is fine" — Alloy cannot continuously prove that, and claiming it would be inventing certainty.';

comment on column public.communication_ingress_routes.last_inbound_at is
    'When a message was last actually received at this destination. The evidence behind inbound_observed, and the only basis on which receiving may be reported as working.';

-- One destination resolves to exactly one tenant, enforced GLOBALLY.
--
-- The same invariant `communication_bindings_inbound_address_uq` already gives
-- the visible address. Without it here, two organizations could each claim the
-- same provider destination and inbound routing would find two owners for a
-- message that has exactly one. Case-insensitive: mail addresses are not case
-- sensitive in practice, so `Inbound@` and `inbound@` are one destination.
create unique index if not exists communication_ingress_routes_destination_uq
    on public.communication_ingress_routes (lower(destination));

-- Ownership resolution reads by destination; readiness reads by binding.
create index if not exists idx_comm_ingress_routes_binding
    on public.communication_ingress_routes (communication_provider_binding_id);

alter table public.communication_ingress_routes enable row level security;

create policy communication_ingress_routes_select_org
    on public.communication_ingress_routes for select to authenticated
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.org_id = communication_ingress_routes.org_id));

create policy communication_ingress_routes_service_all
    on public.communication_ingress_routes for all to authenticated
    using ((auth.role() = 'service_role'::text))
    with check ((auth.role() = 'service_role'::text));

-- Grants deliberately EXCLUDE `anon`. The older communications tables grant to
-- anon for historical reasons; issue #318 established that anon must hold no
-- public-schema access, and a new table must not reintroduce it.
grant select on table public.communication_ingress_routes to authenticated;
grant all on table public.communication_ingress_routes to service_role;
