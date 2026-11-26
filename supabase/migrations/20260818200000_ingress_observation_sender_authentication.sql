-- Keep the authentication facts the gate actually used.
--
-- The historical replay could not recover them, and that single absence dominated the
-- first real measurement: authentication is derived at ingestion from headers the
-- transport stamped, so every message received before that derivation existed reads
-- `unknown` forever, and every Lane B message in the corpus landed in review because of
-- it. The counterfactual run showed the policy would have admitted 23 of them — but a
-- counterfactual is a model, and the corpus could not tell "Lane B is unsafe" from "Lane B
-- was never told anything".
--
-- These two columns stop that recurring. From here, a live observation carries the result
-- AND which check produced it, so the next corpus can separate policy from evidence
-- without re-deriving anything.
--
-- WHAT IS DELIBERATELY NOT STORED: the raw `Authentication-Results` header, any DKIM
-- signature material, `Received` chains, or any other provider header. The evidence CLASS
-- is what analysis needs — dmarc spoke, or spf spoke, or nothing did — and a signature
-- blob is provider material that would turn an analysis table into a header archive.
--
-- Additive: two columns with defaults matching the honest value for rows already present.
-- Historical replay rows keep `unknown`/`none`, which is exactly what they mean.

alter table public.communication_ingress_eligibility_observations
    add column if not exists sender_authentication text not null default 'unknown',
    add column if not exists sender_authentication_evidence text not null default 'none';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'comm_ingress_obs_sender_authentication_check') then
        alter table public.communication_ingress_eligibility_observations
            add constraint comm_ingress_obs_sender_authentication_check
            check (sender_authentication in ('pass', 'fail', 'unknown'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'comm_ingress_obs_sender_auth_evidence_check') then
        alter table public.communication_ingress_eligibility_observations
            add constraint comm_ingress_obs_sender_auth_evidence_check
            check (sender_authentication_evidence in ('dmarc', 'spf', 'none'));
    end if;
    -- A result cannot be stronger than the evidence behind it. `pass` or `fail` with no
    -- check reported would be an assertion with nothing under it, which is the exact shape
    -- of claim this whole table exists to make impossible.
    if not exists (select 1 from pg_constraint where conname = 'comm_ingress_obs_sender_auth_pairing_check') then
        alter table public.communication_ingress_eligibility_observations
            add constraint comm_ingress_obs_sender_auth_pairing_check
            check (sender_authentication = 'unknown' or sender_authentication_evidence <> 'none');
    end if;
end $$;

comment on column public.communication_ingress_eligibility_observations.sender_authentication is
    'What the receiving transport was able to prove about the sender: pass, fail, or unknown. `unknown` is treated as failure wherever authentication is load-bearing — an unreported check is not a passed check.';

comment on column public.communication_ingress_eligibility_observations.sender_authentication_evidence is
    'WHICH check produced the result — dmarc, spf, or none. The class only: never the raw header, never DKIM signature material. Distinguishes "unknown" from "unknown because nobody asked", which is the difference between a policy finding and an evidence gap.';

-- Reading the corpus by evidence quality is the point of having it.
create index if not exists idx_comm_ingress_obs_authentication
    on public.communication_ingress_eligibility_observations (org_id, sender_authentication, sender_authentication_evidence);

do $verify$
begin
    if has_table_privilege('anon', 'public.communication_ingress_eligibility_observations', 'SELECT')
       or has_table_privilege('authenticated', 'public.communication_ingress_eligibility_observations', 'INSERT') then
        raise exception 'observations table privileges regressed';
    end if;
end
$verify$;
