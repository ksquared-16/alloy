-- Read-only census: did /a/<code> break because the plaintext token column was dropped?
--
-- WHY THIS FILE EXISTS
-- A promoted Tour invitation now carries the correct hosted origin, but clicking it lands on the
-- staging marketing homepage. That is NOT an origin defect and NOT an edge-routing defect: a live
-- probe of https://staging.workwithalloy.com/a/ZZZZZZZZ returns `x-matched-path: /a/[token]` with
-- HTTP 307 `location: /`, so the application DOES own the route and the route itself is redirecting.
--
-- The suspected cause is a missed call site in the S-3 plaintext-token removal. Migration
-- 20260818230000 dropped `action_links.token`. The mint (lib/actionLinks.ts) was updated to write
-- `token_hash`, and every other reader was updated -- but `app/a/[token]/page.tsx` still issues
--     select("token, short_code, action_type, entity_type, entity_id, consumed_at, expires_at, metadata")
-- Selecting a dropped column makes PostgREST reject the WHOLE query, so both the by-hash and the
-- by-short-code lookups fail, `row` stays null, and the page falls through to redirect("/").
-- Every action link would land on the marketing homepage, which is exactly what was observed.
--
-- This census tests that mechanism and retrieves the operator's actual received URL.
--
-- POSITIVE CONTROL
-- `column_probe` returns one row per column that DOES exist. If `token_hash` comes back present and
-- `token` absent, the drop is applied and the reader is selecting a column that is gone. If BOTH
-- come back, the theory is wrong and the cause is elsewhere -- that is the finding, not a failure.
--
-- Reader contract: column 1 question id, column 2 a fixed literal, every fact inside the JSON
-- payload so nothing is positionally swallowed. One statement. No DDL. No writes.
select question_id, 'data' as row_kind, payload from (
    -- 1. Is the drop actually applied on THIS database?
    select
        'migration_ledger'::text as question_id,
        json_build_object('version', m.version)::text as payload
    from supabase_migrations.schema_migrations m
    where m.version in ('20260818220000', '20260818230000')
) q1

union all

select question_id, 'data' as row_kind, payload from (
    -- 2. THE DISCRIMINATOR. Which of the two columns actually exists right now?
    select
        'column_probe'::text as question_id,
        json_build_object('column', c.column_name, 'nullable', c.is_nullable)::text as payload
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'action_links'
      and c.column_name in ('token', 'token_hash', 'short_code', 'consumed_at', 'expires_at')
) q2

union all

select question_id, 'data' as row_kind, payload from (
    -- 3. The operator's ACTUAL received link. Item 1 of the instruction asks for the exact URL,
    --    message id, origin, path and code -- taken from the persisted body, not reconstructed.
    select
        'recent_action_link_message'::text as question_id,
        json_build_object(
            'message_id', m.id,
            'org_id', m.org_id,
            'channel', m.channel,
            'status', m.status,
            'created_at', m.created_at,
            'to_address', m.to_address,
            'action_url', substring(m.body from '[hH][tT][tT][pP][sS]?://[^[:space:]"<)]*/a/[A-Za-z0-9]+'),
            'any_loopback', (m.body ~* 'https?://(localhost|127[.]0[.]0[.]1)')
        )::text as payload
    from public.communication_messages m
    where m.direction = 'outbound'
      and m.body ~ '/a/[A-Za-z0-9]+'
      and m.created_at > now() - interval '3 days'
    order by m.created_at desc
    limit 25
) q3

union all

select question_id, 'data' as row_kind, payload from (
    -- 4. Are those links otherwise HEALTHY? Item 10 asks whether the token survives the repair.
    --    If they are unconsumed and unexpired with a redirect_path, then nothing is wrong with the
    --    credential and a re-send after the fix is sufficient -- no token reissue needed.
    select
        'recent_tour_alias'::text as question_id,
        json_build_object(
            'short_code', a.short_code,
            'created_at', a.created_at,
            'expires_at', a.expires_at,
            'expired', (a.expires_at <= now()),
            'consumed_at', a.consumed_at,
            'has_token_hash', (a.token_hash is not null),
            'redirect_path', a.metadata ->> 'redirect_path'
        )::text as payload
    from public.action_links a
    where a.action_type = 'tour_booking_redirect'
      and a.created_at > now() - interval '3 days'
    order by a.created_at desc
    limit 25
) q4
