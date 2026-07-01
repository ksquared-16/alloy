-- Task Assist V1.1 Card 5: worker-safe claim for due communication_scheduled_sends (SKIP LOCKED).

CREATE OR REPLACE FUNCTION public.claim_due_communication_scheduled_sends(
    p_limit integer,
    p_now timestamptz,
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.communication_scheduled_sends
LANGUAGE plpgsql
VOLATILE
AS $function$
BEGIN
    IF p_limit IS NULL OR p_limit < 1 THEN
        RAISE EXCEPTION 'claim_due_communication_scheduled_sends: p_limit must be >= 1';
    END IF;

    RETURN QUERY
    WITH picked AS (
        SELECT css.id
        FROM public.communication_scheduled_sends AS css
        WHERE css.status = 'pending'::text
          AND css.scheduled_for <= p_now
          AND css.communication_message_id IS NULL
          AND (p_org_id IS NULL OR css.org_id = p_org_id)
        ORDER BY css.scheduled_for ASC, css.id ASC
        FOR UPDATE OF css SKIP LOCKED
        LIMIT p_limit
    ),
    updated AS (
        UPDATE public.communication_scheduled_sends AS t
        SET
            status = 'claimed'::text,
            claim_token = gen_random_uuid(),
            claimed_at = p_now,
            updated_at = now()
        FROM picked
        WHERE t.id = picked.id
        RETURNING t.*
    )
    SELECT * FROM updated;
END;
$function$;

COMMENT ON FUNCTION public.claim_due_communication_scheduled_sends(integer, timestamptz, uuid) IS
    'Atomically claims up to p_limit due rows (pending, scheduled_for <= p_now, no message id) using SKIP LOCKED. Optional p_org_id scopes to one org for admin-triggered runs.';

REVOKE ALL ON FUNCTION public.claim_due_communication_scheduled_sends(integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_communication_scheduled_sends(integer, timestamptz, uuid) TO service_role;
