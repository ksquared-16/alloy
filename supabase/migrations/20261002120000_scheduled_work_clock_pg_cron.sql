-- THE STAGING CLOCK: pg_cron owns time, pg_net owns delivery, Alloy owns the rest.
--
-- Director decision 2026-09-21, after both alternatives were measured and rejected:
-- Vercel Cron registers only from a production deployment and staging is preview;
-- GitHub Actions fires schedules only from the default branch and has produced one
-- scheduled run in the repository's history. See
-- docs/platform/governance/deployment-and-environments.md.
--
-- This schedule's ONLY business operation is an authenticated request to the generic
-- wake endpoint. It knows nothing about billing, late fees or autopay, and it must
-- never call a domain handler: what is due, claiming, leases, dispatch, outcomes,
-- retry and convergence all remain inside the already-certified runtime.
--
-- ── THE SECRET NEVER APPEARS HERE ──
--
-- The credential is read from Vault AT EXECUTION TIME. What is stored in
-- `cron.job.command` is the lookup, not the value. Two consequences worth knowing:
--
--   * A missing credential produces NO REQUEST rather than a bad one. The Vault read
--     is a FROM clause, so zero rows means zero calls — the clock stays silent
--     instead of hammering the endpoint with unauthenticated wakes that would look
--     like an attack and read like a broken endpoint.
--   * Rotation is a Vault update. No migration, no deploy, no code change.
--
-- The target URL is read the same way and falls back to the canonical staging
-- endpoint, so production activation is configuration rather than a code change.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Idempotent by construction: unschedule-then-schedule, because cron.schedule with a
-- duplicate name updates in place on newer pg_cron but errors on older, and a failed
-- apply does not roll back DDL already issued.
do $$
begin
    if exists (select 1 from cron.job where jobname = 'scheduled-work-clock') then
        perform cron.unschedule('scheduled-work-clock');
    end if;
end
$$;

select cron.schedule(
    'scheduled-work-clock',
    '*/5 * * * *',
    $job$
    select net.http_post(
        url := coalesce(
            (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'scheduled_work_wake_url'),
            'https://staging.workwithalloy.com/api/scheduled-work/wake'
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || c.decrypted_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets c
    where c.name = 'scheduled_work_wake_credential'
    $job$
);
