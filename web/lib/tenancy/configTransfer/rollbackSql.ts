/**
 * The step-16 removal (briefing §7, "If step 16 fails its checks"): one transaction that removes every row the org
 * helper and the import wrote for one org, and the org itself, or nothing at all. Run by the operator with psql as
 * `postgres` on the new project (the same connection as step 9), never through the data API.
 *
 * Why SQL with guards lifted, and not the app's paths: the app never deletes an org. The database refuses it on
 * purpose — a document category a type has used is archived, not deleted (`document_categories_guard`, the W-17
 * trial); published revisions and publications are immutable; an access profile keeps its membership. So inside the
 * one transaction it disables, trigger by trigger, only the enabled user triggers of the tables that hold a row for
 * this org, deletes, re-enables exactly those, and then proves the removal complete. Foreign keys stay enforced
 * throughout (internal triggers are never touched). Any refusal or failed proof raises, and psql's ON_ERROR_STOP
 * leaves the transaction aborted: nothing is removed, and the briefing's fallback (recreate the project) applies.
 *
 * Refuses, before any change: an org that is not there, not `active`, or not named as given; the retired W-17 org;
 * any row for the org in a record or transaction table (the rollback window has closed, briefing §7); a trigger
 * enabled ALWAYS on a table it would touch (it cannot be lifted and restored exactly).
 *
 * The org id and name are psql variables, set into transaction-local settings, never interpolated. The Auth user is
 * not touched: the owner keeps it for a retry, or deletes it in the dashboard.
 */

import { TABLE_CLASSES } from "./allowlist";

const quoteList = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

export function renderRollbackSql(): string {
    return `-- Step-16 removal of one org (briefing §7). One transaction: all of it, or nothing.
\\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT set_config('alloy.rollback_org_id', :'org_id', true), set_config('alloy.rollback_org_name', :'org_name', true);
DO $rollback$
DECLARE
    v_org uuid := current_setting('alloy.rollback_org_id')::uuid;
    v_name text := current_setting('alloy.rollback_org_name');
    v_row record;
    v_t text;
    v_tables text[] := ARRAY[]::text[];
    v_left text[];
    v_lifted text[] := ARRAY[]::text[];
    v_n bigint;
    v_pass int := 0;
    v_progress boolean;
    v_records text[] := ARRAY[${quoteList(TABLE_CLASSES.record_or_transaction)}];
BEGIN
    SELECT id, name, status, slug INTO v_row FROM public.orgs WHERE id = v_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'rollback refused (org_not_found): no org %', v_org; END IF;
    IF v_row.name IS DISTINCT FROM v_name THEN
        RAISE EXCEPTION 'rollback refused (org_name_mismatch): org % is named "%", not "%"', v_org, v_row.name, v_name;
    END IF;
    IF v_row.status <> 'active' THEN RAISE EXCEPTION 'rollback refused (org_not_active): org % is %', v_org, v_row.status; END IF;
    IF v_row.slug LIKE '\\_w17\\_selftest\\_%' THEN RAISE EXCEPTION 'rollback refused (w17_org): the retired self-test org stays (D10)'; END IF;

    -- Every base table in public with an org_id column that holds a row for this org.
    FOR v_row IN
        SELECT c.table_name::text AS t FROM information_schema.columns c
        JOIN information_schema.tables b ON b.table_schema = c.table_schema AND b.table_name = c.table_name
        WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND b.table_type = 'BASE TABLE'
        ORDER BY 1
    LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', v_row.t) INTO v_n USING v_org;
        IF v_n > 0 THEN
            IF v_row.t = ANY (v_records) THEN
                RAISE EXCEPTION 'rollback refused (window_closed): % holds % row(s) for the org; real records exist (briefing §7)', v_row.t, v_n;
            END IF;
            v_tables := v_tables || v_row.t;
            RAISE NOTICE 'holds rows: % %', v_row.t, v_n;
        END IF;
    END LOOP;

    -- Lift the enabled user triggers of those tables and of orgs, one by one, remembering each.
    FOR v_row IN
        SELECT r.relname::text AS t, tg.tgname::text AS g, tg.tgenabled AS e
        FROM pg_trigger tg JOIN pg_class r ON r.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'public' AND NOT tg.tgisinternal AND r.relname::text = ANY (v_tables || 'orgs'::text)
        ORDER BY 1, 2
    LOOP
        IF v_row.e = 'A' THEN RAISE EXCEPTION 'rollback refused (trigger_always): %.% is enabled ALWAYS', v_row.t, v_row.g; END IF;
        IF v_row.e = 'O' THEN
            EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', v_row.t, v_row.g);
            v_lifted := v_lifted || (v_row.t || '.' || v_row.g);
        END IF;
    END LOOP;
    RAISE NOTICE 'lifted % trigger(s)', coalesce(array_length(v_lifted, 1), 0);

    -- Delete, in as many passes as the foreign keys need (a table referenced by another waits for it).
    v_left := v_tables;
    WHILE coalesce(array_length(v_left, 1), 0) > 0 LOOP
        v_pass := v_pass + 1;
        v_progress := false;
        FOREACH v_t IN ARRAY v_left LOOP
            BEGIN
                EXECUTE format('DELETE FROM public.%I WHERE org_id = $1', v_t) USING v_org;
                GET DIAGNOSTICS v_n = ROW_COUNT;
                RAISE NOTICE 'pass %: deleted % from %', v_pass, v_n, v_t;
                v_left := array_remove(v_left, v_t);
                v_progress := true;
            EXCEPTION WHEN foreign_key_violation THEN
                NULL;
            END;
        END LOOP;
        IF NOT v_progress THEN RAISE EXCEPTION 'rollback failed (fk_cycle): cannot delete from %', v_left; END IF;
    END LOOP;
    DELETE FROM public.orgs WHERE id = v_org;
    -- Deferred foreign-key checks run now, while the deletes are still undoable, and so that no trigger event is
    -- pending when a trigger is re-enabled (Postgres refuses ALTER TABLE on a table with pending events).
    SET CONSTRAINTS ALL IMMEDIATE;

    -- Restore exactly what was lifted.
    FOR v_row IN SELECT split_part(x, '.', 1) AS t, split_part(x, '.', 2) AS g FROM unnest(v_lifted) x LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', v_row.t, v_row.g);
    END LOOP;

    -- Prove it complete: no row for the org in any org_id table, no org row, every lifted trigger enabled again.
    FOR v_row IN
        SELECT c.table_name::text AS t FROM information_schema.columns c
        JOIN information_schema.tables b ON b.table_schema = c.table_schema AND b.table_name = c.table_name
        WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND b.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', v_row.t) INTO v_n USING v_org;
        IF v_n > 0 THEN RAISE EXCEPTION 'rollback failed (incomplete): % still holds % row(s)', v_row.t, v_n; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org) THEN RAISE EXCEPTION 'rollback failed (incomplete): the org row remains'; END IF;
    IF EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_class r ON r.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'public' AND (r.relname::text || '.' || tg.tgname::text) = ANY (v_lifted) AND tg.tgenabled <> 'O'
    ) THEN RAISE EXCEPTION 'rollback failed (trigger_not_restored)'; END IF;
    RAISE NOTICE 'removed org % ("%") from % table(s) in % pass(es); % trigger(s) restored',
        v_org, v_name, coalesce(array_length(v_tables, 1), 0), v_pass, coalesce(array_length(v_lifted, 1), 0);
END
$rollback$;
COMMIT;
`;
}
