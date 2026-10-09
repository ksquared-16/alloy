-- =============================================================================
-- W7-F008 — A POSTED CHARGE AND ITS JOURNAL ENTRY ARE ONE FACT.
--
-- Posting flipped `charges.status` to 'posted' in one PostgREST call and wrote the
-- `charge_posted` journal entry in a second, best-effort call that swallowed every
-- refusal. When the accounting-period trigger refused the entry
-- (`accounting_period_unavailable`, `accounting_period_closed`) the charge stayed posted
-- with no consequence in the journal, and nothing said so. Corrections had the same
-- shape: the posted correction row was inserted, then `charge_corrected` was attempted.
--
-- These functions make each pair ONE transaction. The charge write and the journal
-- insert commit together or not at all, so a refused entry refuses the post and the
-- draft stays a draft (a refused correction is not written). The journal row itself is
-- still built by the application (`financialJournalService.journalEntryRow`) — the single
-- authority for its shape — and attributed by the existing BEFORE INSERT trigger.
--
-- Idempotent on (org_id, idempotency_key), exactly like the application insert: a retry
-- converges on the one entry. SECURITY INVOKER and service_role only, because the journal
-- is service_role-written (RLS) and so is every caller of these paths.
--
-- No row is rewritten and no history is backfilled. Re-runnable.
-- =============================================================================

-- One journal row from its JSON shape. Unknown keys are refused rather than dropped, so a
-- renamed column cannot silently write a half-row.
CREATE OR REPLACE FUNCTION public.insert_financial_journal_entry_jsonb(p_entry jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
    v_cols text;
    v_unknown text;
    v_id uuid;
BEGIN
    IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
        RAISE EXCEPTION 'journal entry must be a JSON object' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k, ', ') INTO v_unknown
      FROM jsonb_object_keys(p_entry) k
     WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = 'financial_journal_entries' AND c.column_name = k);
    IF v_unknown IS NOT NULL THEN
        RAISE EXCEPTION 'journal entry carries unknown columns: %', v_unknown USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(p_entry) k;

    EXECUTE format(
        'INSERT INTO public.financial_journal_entries (%1$s) '
        'SELECT %1$s FROM jsonb_populate_record(NULL::public.financial_journal_entries, $1) '
        'ON CONFLICT (org_id, idempotency_key) DO NOTHING RETURNING id',
        v_cols)
      USING p_entry
      INTO v_id;

    IF v_id IS NULL THEN
        SELECT j.id INTO v_id
          FROM public.financial_journal_entries j
         WHERE j.org_id = (p_entry->>'org_id')::uuid
           AND j.idempotency_key = p_entry->>'idempotency_key';
    END IF;
    RETURN v_id;
END;
$function$;

-- Draft → posted, and its `charge_posted` entry, together. Returns no row when the charge
-- was not a draft (a concurrent post won; the caller re-reads, as before). `p_entry` is
-- NULL only for a zero-amount charge, which has no accounting consequence to record.
CREATE OR REPLACE FUNCTION public.post_charge_with_journal(
    p_org_id uuid,
    p_charge_id uuid,
    p_posted_at timestamptz,
    p_actor_user_id uuid,
    p_entry jsonb
)
RETURNS SETOF public.charges
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
    v_row public.charges;
BEGIN
    IF p_entry IS NOT NULL AND (
        (p_entry->>'source_id')::uuid IS DISTINCT FROM p_charge_id
        OR (p_entry->>'org_id')::uuid IS DISTINCT FROM p_org_id
        OR p_entry->>'source_type' IS DISTINCT FROM 'charge'
        OR p_entry->>'entry_type' IS DISTINCT FROM 'charge_posted') THEN
        RAISE EXCEPTION 'journal entry does not describe posting charge %', p_charge_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.charges
       SET status = 'posted',
           posted_at = p_posted_at,
           posted_by = p_actor_user_id,
           updated_at = p_posted_at,
           updated_by = p_actor_user_id
     WHERE org_id = p_org_id
       AND id = p_charge_id
       AND status = 'draft'
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_entry IS NOT NULL THEN
        PERFORM public.insert_financial_journal_entry_jsonb(p_entry);
    ELSIF v_row.amount_cents IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'charge % has an amount and must be posted with its journal entry', p_charge_id USING ERRCODE = '22023';
    END IF;

    RETURN NEXT v_row;
END;
$function$;

-- A posted correction row, and its `charge_corrected` entry, together. The row's id is
-- chosen by the caller so the entry can name it before either is written.
CREATE OR REPLACE FUNCTION public.insert_posted_charge_with_journal(p_charge jsonb, p_entry jsonb)
RETURNS SETOF public.charges
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
    v_cols text;
    v_unknown text;
    v_row public.charges;
BEGIN
    IF p_charge IS NULL OR jsonb_typeof(p_charge) <> 'object' OR p_charge->>'id' IS NULL THEN
        RAISE EXCEPTION 'charge must be a JSON object with an id' USING ERRCODE = '22023';
    END IF;
    IF p_charge->>'status' IS DISTINCT FROM 'posted' THEN
        RAISE EXCEPTION 'only a posted charge is written with its journal entry' USING ERRCODE = '22023';
    END IF;
    IF p_entry IS NULL
        OR (p_entry->>'source_id') IS DISTINCT FROM (p_charge->>'id')
        OR (p_entry->>'org_id') IS DISTINCT FROM (p_charge->>'org_id')
        OR p_entry->>'source_type' IS DISTINCT FROM 'charge' THEN
        RAISE EXCEPTION 'journal entry does not describe charge %', p_charge->>'id' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k, ', ') INTO v_unknown
      FROM jsonb_object_keys(p_charge) k
     WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = 'charges' AND c.column_name = k);
    IF v_unknown IS NOT NULL THEN
        RAISE EXCEPTION 'charge carries unknown columns: %', v_unknown USING ERRCODE = '22023';
    END IF;

    -- Only the keys supplied are inserted, so every other column keeps its DEFAULT.
    SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(p_charge) k;
    EXECUTE format(
        'INSERT INTO public.charges (%1$s) '
        'SELECT %1$s FROM jsonb_populate_record(NULL::public.charges, $1) RETURNING *',
        v_cols)
      USING p_charge
      INTO v_row;

    PERFORM public.insert_financial_journal_entry_jsonb(p_entry);
    RETURN NEXT v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_financial_journal_entry_jsonb(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_charge_with_journal(uuid, uuid, timestamptz, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_posted_charge_with_journal(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_financial_journal_entry_jsonb(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_charge_with_journal(uuid, uuid, timestamptz, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_posted_charge_with_journal(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.post_charge_with_journal(uuid, uuid, timestamptz, uuid, jsonb) IS
    'W7-F008: draft → posted and its charge_posted journal entry in one transaction; a refused entry refuses the post.';
COMMENT ON FUNCTION public.insert_posted_charge_with_journal(jsonb, jsonb) IS
    'W7-F008: a posted correction row and its charge_corrected journal entry in one transaction.';
