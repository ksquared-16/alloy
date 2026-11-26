-- ACTIVATION FIX: present the credential on BOTH accepted headers.
--
-- Measured 2026-09-21: the clock fired at 19:00:00Z and 19:05:00Z, pg_net dispatched
-- with no transport error, the request REACHED the deployed endpoint, and the endpoint
-- returned 401 {"ok":false,"error":"UNAUTHORIZED"}. So egress, Vault retrieval and
-- delivery are all proven; only admission failed.
--
-- The cause is a header/variable mismatch in the original schedule, not in the route.
-- The certified wake contract accepts TWO credentials:
--
--     Authorization: Bearer <value>   verified against CRON_SECRET
--     x-cron-token: <value>           verified against INTERNAL_CRON_TOKEN
--
-- The original schedule sent only the Bearer form, which admits only if the deployed
-- environment holds the value in CRON_SECRET specifically. If the operator instead
-- reused the estate's existing INTERNAL_CRON_TOKEN — which was offered as the option
-- requiring no Vercel change — the Bearer arrives and is correctly refused.
--
-- Sending the same value on both headers makes activation converge WITHOUT needing to
-- know which variable holds it, and without a second authentication scheme: both are
-- the existing certified contract, and a wrong value is still refused on both paths.
-- The route is not touched and admission is not weakened.

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
            'Authorization', 'Bearer ' || c.decrypted_secret,
            'x-cron-token', c.decrypted_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets c
    where c.name = 'scheduled_work_wake_credential'
    $job$
);
