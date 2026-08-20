-- What a receiving address is FOR, which the model could not previously say.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
--
-- `communication_provider_bindings.inbound_address` records that an organization
-- receives at an address. It records nothing about why. Every address is therefore
-- the same kind of address, and inbound admission can only ever be "somebody wrote
-- to us" — which is true of a parent's reply, a bank statement and a payroll notice
-- alike.
--
-- Two of the four ingress lanes depend on the missing fact:
--
--   PURPOSE INTAKE      subsidy@ invoices@ licensing@ billing@
--                       The organization dedicated this address to one kind of
--                       work, so an UNKNOWN sender is expected and the recipient
--                       itself is the authorization.
--
--   ACQUISITION         enrollment@ admissions@
--                       Dedicated to inbound demand. Unknown senders are the point.
--
-- Without this column those lanes can only be expressed by hard-coding address
-- local-parts, which is configuration smuggled into code and wrong the first time a
-- school uses `financial-aid@` instead of `subsidy@`.
--
-- ---------------------------------------------------------------------------
-- WHY IT LIVES ON THE BINDING AND NOT ON THE ROUTE
-- ---------------------------------------------------------------------------
--
-- `communication_ingress_routes.destination` is TRANSPORT — where mail is
-- administratively delivered so Alloy can observe it, deliberately never shown to
-- anyone. Intake role is the opposite: it is a property of the VISIBLE identity, the
-- address a family or an agency actually writes to, and it is exactly what an
-- administrator configures. A purpose identity keeps its purpose whether it is
-- delivered directly or routed through an opaque destination, so putting the role on
-- the route would make the same address mean different things depending on how its
-- mail happens to travel.
--
-- ---------------------------------------------------------------------------
-- ADDITIVE, AND CONSERVATIVE BY DEFAULT
-- ---------------------------------------------------------------------------
--
-- New columns with a default, no data mutation, no backfill, nothing dropped or
-- narrowed. Every existing binding becomes `conversation`, which is the honest
-- reading: no existing address was ever declared as dedicated to a purpose, and
-- `conversation` is the role that admits the LEAST — it requires other evidence.
-- Guessing `purpose` from a local-part would have silently widened admission for
-- addresses nobody reviewed.

alter table public.communication_provider_bindings
    add column if not exists intake_role text not null default 'conversation',
    add column if not exists intake_purpose_key text;

-- The vocabulary is closed and mirrors `IngressIdentityRole` in
-- `web/lib/communications/ingress/emailIngressEligibility.ts`. A free-text role is
-- how "this address is sort of for enrollment" becomes an admission rule.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'communication_bindings_intake_role_check'
    ) then
        alter table public.communication_provider_bindings
            add constraint communication_bindings_intake_role_check
            check (intake_role in ('conversation', 'purpose', 'acquisition'));
    end if;
end $$;

-- A purpose identity that cannot name its purpose supplies no purpose, and a
-- conversation address carrying one would assert a dedication it does not have.
-- Both directions are refused, so the pair cannot drift into disagreeing.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'communication_bindings_intake_purpose_pairing_check'
    ) then
        alter table public.communication_provider_bindings
            add constraint communication_bindings_intake_purpose_pairing_check
            check (
                (intake_role = 'purpose' and intake_purpose_key is not null)
                or (intake_role <> 'purpose' and intake_purpose_key is null)
            );
    end if;
end $$;

comment on column public.communication_provider_bindings.intake_role is
    'What this receiving identity is FOR. conversation = a general operational address, admitted only on other evidence (a thread, a watched relationship, an explicit allow). purpose = dedicated to one kind of work, where the recipient itself authorizes ingestion and an unknown sender is expected. acquisition = dedicated to inbound demand, where unknown senders are the point. Read by the deterministic ingress eligibility gate; never inferred from the address text.';

comment on column public.communication_provider_bindings.intake_purpose_key is
    'Domain vocabulary for a purpose identity (subsidy_intake, invoice_intake, licensing_intake, billing_intake). Deliberately NOT the outbound purpose registry key: that vocabulary governs what a capability may EMIT and is compliance-inert, while this one describes why a message was ACCEPTED. Conflating them would let an intake configuration widen what Alloy is permitted to send.';

-- Reading intake configuration is per-organization and always by channel, which is
-- how the eligibility context loader fetches it.
create index if not exists idx_comm_bindings_org_channel_intake
    on public.communication_provider_bindings (org_id, channel, intake_role);
