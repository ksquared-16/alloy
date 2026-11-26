-- Read-only census: which recipient-facing Alloy links already carry a loopback origin?
--
-- WHY THIS FILE EXISTS
-- A Tour invitation sent by an operator on hosted staging carried a `localhost` booking
-- link. The hosted runtimes are correctly configured -- the staging bundle inlines
-- NEXT_PUBLIC_APP_URL=https://staging.workwithalloy.com and production inlines
-- https://workwithalloy.com -- so a hosted runtime cannot have MINTED that origin.
-- The managed agent slots, however, run at http://localhost:301X while pointing
-- NEXT_PUBLIC_SUPABASE_URL at the SAME project staging reads
-- (ikaxilmwmrmbagoidedu). A link is materialized as absolute text at prepare time and
-- persisted, so whichever runtime prepared it owns the origin forever.
--
-- This census measures the blast radius of that: how many persisted bodies already carry a
-- loopback origin, how many are still unsent (and therefore remediable), and whether the
-- Tour alias rows point anywhere unsafe.
--
-- POSITIVE CONTROL
-- `hosted_origin_msg` counts bodies carrying the real staging origin. If that comes back
-- zero the probe cannot say yes, and a zero loopback count would prove nothing.
--
-- Reader contract (learned from hosted-ledger-census-v2.sql): column 1 is the question id,
-- column 2 is a fixed literal, and every identifying fact travels inside the JSON payload
-- so nothing is positionally swallowed.
--
-- One statement. No DDL. No writes.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- 1. Every persisted body carrying a loopback origin, with the offending URL extracted.
    select
        'loopback_msg'::text as question_id,
        json_build_object(
            'message_id', m.id,
            'org_id', m.org_id,
            'channel', m.channel,
            'direction', m.direction,
            'status', m.status,
            'created_at', m.created_at,
            'loopback_url', substring(m.body from '[hH][tT][tT][pP][sS]?://(?:localhost|127[.]0[.]0[.]1)(?::[0-9]+)?[^[:space:]"<)]*')
        )::text as payload
    from public.communication_messages m
    where m.body ~* 'https?://(localhost|127[.]0[.]0[.]1)'
    order by m.created_at desc
    limit 200
) q1

union all

select question_id, 'data' as row_kind, payload from (
    -- 2. Shape of the blast radius: how many, in which lifecycle state, on which channel.
    select
        'loopback_by_state'::text as question_id,
        json_build_object(
            'channel', m.channel,
            'direction', m.direction,
            'status', m.status,
            'n', count(*)
        )::text as payload
    from public.communication_messages m
    where m.body ~* 'https?://(localhost|127[.]0[.]0[.]1)'
    group by m.channel, m.direction, m.status
) q2

union all

select question_id, 'data' as row_kind, payload from (
    -- 3. POSITIVE CONTROL. If this is zero the probe is broken, not the platform clean.
    select
        'hosted_origin_msg'::text as question_id,
        json_build_object('origin', 'staging.workwithalloy.com', 'n', count(*))::text as payload
    from public.communication_messages m
    where m.body ~* 'https?://staging[.]workwithalloy[.]com'
) q3

union all

select question_id, 'data' as row_kind, payload from (
    -- 4. Rows that have NOT gone out yet -- the only population that can still be repaired
    --    in place rather than re-sent.
    select
        'loopback_unsent'::text as question_id,
        json_build_object(
            'message_id', m.id,
            'org_id', m.org_id,
            'channel', m.channel,
            'status', m.status,
            'created_at', m.created_at
        )::text as payload
    from public.communication_messages m
    where m.body ~* 'https?://(localhost|127[.]0[.]0[.]1)'
      and coalesce(m.status, '') not in ('sent', 'delivered', 'failed', 'bounced')
    order by m.created_at desc
    limit 100
) q4

union all

select question_id, 'data' as row_kind, payload from (
    -- 5. The Tour alias rows themselves. `redirect_path` is same-origin by construction,
    --    so these should be clean -- confirming the defect lives in the RENDERED body and
    --    not in the link store.
    select
        'tour_alias'::text as question_id,
        json_build_object(
            'link_id', a.id,
            'org_id', a.org_id,
            'short_code', a.short_code,
            'entity_id', a.entity_id,
            'created_at', a.created_at,
            'expires_at', a.expires_at,
            'redirect_path', a.metadata ->> 'redirect_path'
        )::text as payload
    from public.action_links a
    where a.action_type = 'tour_booking_redirect'
    order by a.created_at desc
    limit 50
) q5

union all

select question_id, 'data' as row_kind, payload from (
    -- 6. Where ELSE could a frozen absolute URL be hiding? Names only -- no contents read.
    select
        'body_bearing_columns'::text as question_id,
        json_build_object('table', c.table_name, 'column', c.column_name)::text as payload
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name in ('body', 'body_text', 'body_html', 'rendered_snapshot', 'template_body')
    order by c.table_name, c.column_name
) q6
