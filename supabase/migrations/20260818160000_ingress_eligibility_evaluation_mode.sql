-- An observation must say whether it watched mail arrive or judged mail long since filed.
--
-- ---------------------------------------------------------------------------
-- WHY THIS COLUMN IS NOT OPTIONAL
-- ---------------------------------------------------------------------------
--
-- The corpus is about to gain rows produced by replaying 65 already-persisted inbound
-- emails through the gate. Those rows and the rows the live hook writes look identical
-- in every column that exists today — same message ids, same lanes, same reason codes —
-- and they mean completely different things:
--
--   live_observed      the gate saw this message as it was ingested, from the envelope
--                      the transport actually delivered.
--   historical_replay  the gate judged a RECONSTRUCTED envelope, rebuilt from canonical
--                      columns after the fact. Some evidence the live path had is simply
--                      not in the reconstruction — most importantly the transport's
--                      authentication result, which was never captured before
--                      2026-08-18 and therefore reads as `unknown` for every historical
--                      message. Lane B outcomes in a replay are consequently a statement
--                      about MISSING EVIDENCE, not about the policy.
--
-- Mixing them would silently average those two populations into one number, and the
-- number would be wrong in a direction nobody could see. Hence a column, not a
-- convention, and hence it is part of the uniqueness key: the same message may
-- legitimately hold one live observation and one replay observation under the same
-- policy version, and neither should overwrite the other.
--
-- ---------------------------------------------------------------------------
-- DEFAULT IS `live_observed`, DELIBERATELY
-- ---------------------------------------------------------------------------
--
-- The live hook already writes rows without naming a mode, and the honest label for
-- what it produces is `live_observed`. A backtest writer must therefore say what it is
-- doing explicitly, which is the right way round: the reconstruction is the unusual
-- act, so the reconstruction carries the burden of declaring itself.
--
-- Additive: one column with a default, one CHECK, one index replaced by a wider one.
-- No data mutation and no backfill — there are no rows.

alter table public.communication_ingress_eligibility_observations
    add column if not exists evaluation_mode text not null default 'live_observed';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'comm_ingress_eligibility_obs_evaluation_mode_check'
    ) then
        alter table public.communication_ingress_eligibility_observations
            add constraint comm_ingress_eligibility_obs_evaluation_mode_check
            check (evaluation_mode in ('live_observed', 'historical_replay'));
    end if;
end $$;

comment on column public.communication_ingress_eligibility_observations.evaluation_mode is
    'live_observed = the gate saw this message as it was ingested, from the envelope the transport delivered. historical_replay = the gate judged an envelope RECONSTRUCTED from canonical columns after the fact, which cannot carry evidence that was never captured (notably the transport authentication result, absent for every message received before 2026-08-18). The two populations must never be aggregated without this column.';

-- Uniqueness now spans the mode. A replay must not collide with, or overwrite, the live
-- observation of the same message under the same policy — comparing the two is one of
-- the few ways to measure what a reconstruction loses.
drop index if exists public.comm_ingress_eligibility_obs_message_policy_uq;
create unique index if not exists comm_ingress_eligibility_obs_message_policy_mode_uq
    on public.communication_ingress_eligibility_observations
    (org_id, provider, channel, provider_message_id, policy_version, evaluation_mode);

-- Every rollup over this table must be able to separate the populations cheaply.
create index if not exists idx_comm_ingress_eligibility_obs_mode
    on public.communication_ingress_eligibility_observations (org_id, evaluation_mode, decision);

-- The privileges this table was created with are load-bearing and easy to lose to a
-- later ALTER; assert them rather than assume they survived.
do $verify$
declare
    v_role text;
    v_priv text;
begin
    foreach v_role in array array['anon'] loop
        foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
            if has_table_privilege(v_role, 'public.communication_ingress_eligibility_observations', v_priv) then
                raise exception 'observations table regressed: % holds % ', v_role, v_priv;
            end if;
        end loop;
    end loop;
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege('authenticated', 'public.communication_ingress_eligibility_observations', v_priv) then
            raise exception 'observations table regressed: authenticated holds %', v_priv;
        end if;
    end loop;
    if not has_table_privilege('service_role', 'public.communication_ingress_eligibility_observations', 'INSERT') then
        raise exception 'observations table is unwritable by the runtime principal';
    end if;
end
$verify$;
