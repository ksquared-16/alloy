-- What the ingress gate WOULD have done, recorded while it does nothing.
--
-- ---------------------------------------------------------------------------
-- WHY A TABLE AND NOT A LOG LINE
-- ---------------------------------------------------------------------------
--
-- Observe-only exists to answer a question no amount of unit testing can:
-- against real traffic, how often is the deterministic policy WRONG, and in which
-- direction? That question is answered by grouping — decision by lane, lane by
-- reason code, reason code by organization — and by joining back to the messages
-- that were actually ingested to see what a rejection would have cost. Neither is
-- possible against a log stream, and both are trivial against a table.
--
-- It is also the evidence trail. Before this gate may ever enforce anything, someone
-- has to be able to show which messages it would have refused. A row per evaluation,
-- keyed to the provider message id already carried by the ingress receipt, is that
-- showing.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS TABLE DELIBERATELY DOES NOT HOLD
-- ---------------------------------------------------------------------------
--
-- No body. No body excerpt. No subject. No attachment content or filename. No
-- sender address, and no recipient address. Not one of those is needed to analyse a
-- decision, and every one of them would turn an analysis table into a second copy of
-- the mail — which is precisely the accumulation the whole Email Ingress V2 design
-- exists to avoid. A privacy analysis surface that itself leaks content is worse
-- than none, because it wears the wrong label.
--
-- Everything is IDs and closed vocabularies. `provider_message_id` joins to
-- `communication_inbound_ingress` (which already holds `from_address` under its own
-- policy) and to `communication_messages` when the message was persisted, so an
-- investigator with the right permission can still reach the facts — through the
-- table that is already governed for them, not through this one.
--
-- ---------------------------------------------------------------------------
-- OBSERVE-ONLY IS ENFORCED BY WHAT IS ABSENT
-- ---------------------------------------------------------------------------
--
-- There is no foreign key from any operational table to this one, no trigger, and
-- no column any ingestion path reads. A row here cannot change what happens to a
-- message, because nothing that decides a message's fate can see it.

create table if not exists public.communication_ingress_eligibility_observations (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null,

    -- The provider event this decision was about. The join key to the ingress
    -- receipt, and the reason no addresses are stored here.
    provider text not null,
    channel text not null default 'email' check (channel in ('email')),
    provider_message_id text not null,

    -- What the gate WOULD have done. Three states, because the honest answer to a
    -- shared household endpoint or an unauthenticated claim of a real relationship is
    -- neither "ingest" nor "reject" — folding either into a neighbour is exactly how
    -- an ingress gate becomes dangerous.
    decision text not null check (decision in ('WOULD_INGEST', 'WOULD_REQUIRE_REVIEW', 'WOULD_REJECT')),

    -- Why admission was allowed. `none` on every rejection, so a refused message is
    -- still a classified row rather than a gap.
    lane text not null check (lane in (
        'conversation_continuity',
        'purpose_intake',
        'acquisition',
        'relationship_watch',
        'explicit_allow',
        'none'
    )),

    -- The stable machine vocabulary. Named for the EVIDENCE, not the outcome: a
    -- single REJECT_INELIGIBLE would hide the difference between "we do not watch
    -- vendors" (a setting an administrator can change) and "this family is no longer
    -- enrolled" (which they cannot) — in the very corpus that exists to surface it.
    reason_code text not null,

    -- Closed to one value, and checked in the database rather than trusted from the
    -- writer. The requirement is that this gate is deterministic and never AI; a
    -- column that could hold anything else would be a promise instead of a
    -- constraint. Admitting another basis later requires altering this check, which
    -- is a visible, reviewable change.
    confidence_basis text not null default 'deterministic' check (confidence_basis = 'deterministic'),

    -- Which watched relationship kind admitted (or failed to admit) the sender.
    -- The KIND, never the person: `guardian` is analysis, a person id here would be
    -- an unnecessary second index of who writes to a school.
    matched_relationship_type text,

    -- The receiving identity that was addressed — the binding, not the address text.
    matched_identity_id uuid,

    -- The conversation Lane A proved, when it proved one. Never a thread that was
    -- merely guessed from sender/recipient provenance: that is the weakest evidence
    -- in the correlation model and recording it here would overstate the lane.
    matched_thread_id uuid,

    -- Carried so purpose coverage can be measured per address without joining back
    -- to configuration that may have changed since.
    intake_purpose_key text,

    -- What could be believed about the sender, kept separate from why the message was
    -- admitted. This is the axis that shows spoofing exposure: `unverified_relationship`
    -- counts are the population a `From`-based rule would have wrongly trusted.
    sender_assertion text not null check (sender_assertion in (
        'verified_relationship',
        'shared_endpoint',
        'unverified_relationship',
        'unknown'
    )),

    -- Watched relationship kinds this evaluation COULD NOT answer, because Alloy's
    -- data model does not represent them (`vendor` attaches to contacts, not persons;
    -- `agency` has no representation at all).
    --
    -- Without this the corpus reads a coverage gap as a finding: zero agency admissions
    -- would look like "no agency mail arrived" when it means "agency mail is invisible to
    -- us", and those two lead to opposite decisions about enforcement. A false negative
    -- that can be named is evidence; one that cannot is a lie in a table.
    unsupported_watch_kinds text[] not null default '{}',

    evaluated_at timestamptz not null default now(),

    -- Without this, a corpus becomes unreadable the moment the policy changes: two
    -- rows disagreeing about the same message would be indistinguishable from the
    -- gate being non-deterministic.
    policy_version text not null,

    created_at timestamptz not null default now(),

    constraint comm_ingress_eligibility_obs_org_fk
        foreign key (org_id) references public.orgs (id) on delete cascade
);

comment on table public.communication_ingress_eligibility_observations is
    'OBSERVE-ONLY evidence of what the deterministic email ingress eligibility gate WOULD have decided. Nothing in any ingestion path reads this table, so a row here cannot change what happens to a message. Holds no body, no subject, no addresses and no attachment content — only IDs and closed vocabularies; join through provider_message_id for anything more.';

comment on column public.communication_ingress_eligibility_observations.confidence_basis is
    'Always ''deterministic''. Constrained in the database rather than trusted from the writer, because "no AI in the ingress authority" is a requirement and not a convention.';

-- One evaluation per provider message PER POLICY. Re-evaluating an old corpus under
-- a new policy is a new row, not an overwrite: comparing the two versions is the
-- point of keeping them. A second evaluation under the SAME policy would be a
-- duplicate observation of a deterministic function, and is refused.
create unique index if not exists comm_ingress_eligibility_obs_message_policy_uq
    on public.communication_ingress_eligibility_observations
    (org_id, provider, channel, provider_message_id, policy_version);

-- The analysis reads: decisions per organization over time, and lane/reason rollups.
create index if not exists idx_comm_ingress_eligibility_obs_org_time
    on public.communication_ingress_eligibility_observations (org_id, evaluated_at desc);
create index if not exists idx_comm_ingress_eligibility_obs_decision
    on public.communication_ingress_eligibility_observations (org_id, decision, lane);

-- REVOKE BEFORE GRANT, and this is not belt-and-braces.
--
-- Supabase ships a schema-wide `alter default privileges ... grant all on tables to anon,
-- authenticated, service_role`, which fires at CREATE TABLE. A migration that only GRANTs
-- what it intends therefore leaves the default grants in place — the table is readable and
-- WRITABLE by `anon` no matter what the grants below say. `20260803230000_trust_runtime_v1_privilege_correction.sql`
-- established the correction and issue #318 established the rule: `anon` holds no
-- public-schema access. A comment saying grants "deliberately exclude anon" does not
-- exclude anon; this does.
revoke all on table public.communication_ingress_eligibility_observations from anon;
revoke all on table public.communication_ingress_eligibility_observations from authenticated;

alter table public.communication_ingress_eligibility_observations enable row level security;

-- DROP-then-CREATE, because `create policy` has no `if not exists` and a bare CREATE
-- aborts a replay at this line. That matters more than it looks: the REVOKEs above run
-- BEFORE this point and the GRANTs run AFTER, so an abort here leaves the table stripped
-- of the access it is supposed to have and skips the verification block entirely — a
-- migration that fails halfway into a WORSE state than either end. Found by replaying
-- this file against a database that already had it.
drop policy if exists comm_ingress_eligibility_obs_select_org
    on public.communication_ingress_eligibility_observations;
create policy comm_ingress_eligibility_obs_select_org
    on public.communication_ingress_eligibility_observations for select to authenticated
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.org_id = communication_ingress_eligibility_observations.org_id));

drop policy if exists comm_ingress_eligibility_obs_service_all
    on public.communication_ingress_eligibility_observations;
create policy comm_ingress_eligibility_obs_service_all
    on public.communication_ingress_eligibility_observations for all to authenticated
    using ((auth.role() = 'service_role'::text))
    with check ((auth.role() = 'service_role'::text));

-- Read for org members; write for the service role only. The webhook is the writer, and
-- there is no operator action that produces one of these rows.
grant select on table public.communication_ingress_eligibility_observations to authenticated;
grant all on table public.communication_ingress_eligibility_observations to service_role;

-- Prove the end state rather than assume it. If the default-privilege grants survived, or
-- a future edit reintroduces anon, the migration fails here instead of shipping a table
-- that quietly contradicts its own comments.
do $verify$
declare
    anon_grants int;
    authenticated_writes int;
begin
    select count(*) into anon_grants
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'communication_ingress_eligibility_observations'
      and grantee = 'anon';
    if anon_grants > 0 then
        raise exception 'communication_ingress_eligibility_observations must hold no anon grants, found %', anon_grants;
    end if;

    select count(*) into authenticated_writes
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'communication_ingress_eligibility_observations'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
    if authenticated_writes > 0 then
        raise exception 'communication_ingress_eligibility_observations must be read-only for authenticated, found % write grants', authenticated_writes;
    end if;
end
$verify$;
