\set ON_ERROR_STOP 1
BEGIN;
-- A disposable certification principal with existing 'ops' access in the certification org (rolled back).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('f0100000-0000-4000-8000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'f010-probe@cert.invalid', '', now(), now(), now(), '{}', '{}');
INSERT INTO public.user_roles (org_id, user_id, role) VALUES ('00000000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-0000000000aa', 'ops');

CREATE TEMP TABLE f010 (cond text, probe text, result text);
CREATE TEMP TABLE stage AS
  SELECT (jsonb_populate_record(c, jsonb_build_object('id','f0100000-0000-4000-8000-00000000c001','status','draft','metadata', c.metadata || '{"resolution_key":"f010-1"}'))).* FROM public.charges c WHERE c.id='9a4c49ec-7f73-4df8-8afc-433330a51f7f'
  UNION ALL
  SELECT (jsonb_populate_record(c, jsonb_build_object('id','f0100000-0000-4000-8000-00000000c002','status','posted','posted_at',now(),'metadata', c.metadata || '{"resolution_key":"f010-2"}'))).* FROM public.charges c WHERE c.id='9a4c49ec-7f73-4df8-8afc-433330a51f7f';
GRANT ALL ON stage TO authenticated;
GRANT ALL ON f010 TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.probe(p_cond text, p_probe text, p_sql text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v text; n bigint;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    v := CASE WHEN n = 0 THEN 'NO ROWS (RLS hid/denied the row)' ELSE 'ALLOWED (' || n || ' row)' END;
    RAISE EXCEPTION 'rollback_probe';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_probe' THEN v := 'REFUSED: ' || left(SQLERRM, 120); END IF;
  END;
  INSERT INTO f010 VALUES (p_cond, p_probe, v);
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.run_probes(p_cond text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE src text := '9a4c49ec-7f73-4df8-8afc-433330a51f7f';
BEGIN
  -- 1. INSERT a draft
  PERFORM pg_temp.probe(p_cond, '1 insert draft', $q$INSERT INTO public.charges SELECT * FROM stage WHERE status='draft'$q$);
  -- 2. INSERT already posted
  PERFORM pg_temp.probe(p_cond, '2 insert posted', $q$INSERT INTO public.charges SELECT * FROM stage WHERE status='posted'$q$);
  -- 3. UPDATE a draft to posted (bypassing postChildcareCharge)
  PERFORM pg_temp.probe(p_cond, '3 update draft->posted', format($q$UPDATE public.charges SET status='posted', posted_at=now() WHERE id=%L AND status='draft'$q$, src));
  -- 4. alter amount / date / period on an existing draft
  PERFORM pg_temp.probe(p_cond, '4a update amount', format($q$UPDATE public.charges SET amount_cents = amount_cents + 1 WHERE id=%L$q$, src));
  PERFORM pg_temp.probe(p_cond, '4b update service date', format($q$UPDATE public.charges SET service_date = service_date + 1, occurs_on = occurs_on + 1 WHERE id=%L$q$, src));
  PERFORM pg_temp.probe(p_cond, '4c update period', format($q$UPDATE public.charges SET billing_period_id = NULL WHERE id=%L$q$, src));
END $fn$;

GRANT EXECUTE ON FUNCTION pg_temp.probe(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.run_probes(text) TO authenticated;

-- (A) the database as it is: 17 orgs, so current_org_id() is NULL
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f0100000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
SELECT pg_temp.run_probes('A multi-org (as deployed)');
RESET ROLE;

-- (B) a single-org deployment: current_org_id() answers the principal's org
CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $f$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $f$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f0100000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
SELECT pg_temp.run_probes('B single-org');
-- 6, last and at top level (the transaction is rolled back below): post directly, then look for the entry
UPDATE public.charges SET status='posted', posted_at=now() WHERE id='9a4c49ec-7f73-4df8-8afc-433330a51f7f' AND status='draft';
INSERT INTO f010 SELECT 'B single-org', '6 direct post: charge now', status || ' / posted_at set: ' || (posted_at IS NOT NULL)::text FROM public.charges WHERE id='9a4c49ec-7f73-4df8-8afc-433330a51f7f';
RESET ROLE;
INSERT INTO f010 SELECT 'B single-org', '6 direct post: journal entries for it', count(*)::text FROM public.financial_journal_entries j WHERE j.source_type='charge' AND j.source_id='9a4c49ec-7f73-4df8-8afc-433330a51f7f';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f0100000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
SELECT pg_temp.probe('B single-org', '4d posted: update amount', $q$UPDATE public.charges SET amount_cents = amount_cents + 1 WHERE id='9a4c49ec-7f73-4df8-8afc-433330a51f7f'$q$);
SELECT pg_temp.probe('B single-org', '4e posted: back to draft', $q$UPDATE public.charges SET status='draft' WHERE id='9a4c49ec-7f73-4df8-8afc-433330a51f7f'$q$);
SELECT pg_temp.probe('B single-org', '4f posted: rewrite posted_by', $q$UPDATE public.charges SET posted_by='f0100000-0000-4000-8000-0000000000aa' WHERE id='9a4c49ec-7f73-4df8-8afc-433330a51f7f'$q$);
SELECT pg_temp.probe('B single-org', '4g posted: edit description', $q$UPDATE public.charges SET description='edited by a session' WHERE id='9a4c49ec-7f73-4df8-8afc-433330a51f7f'$q$);
SELECT pg_temp.probe('B single-org', '7 delete a draft', $q$DELETE FROM public.charges WHERE id='4533cbd8-0df7-4b09-b9c1-7b5cbde4c99d'$q$);
RESET ROLE;

SELECT cond, probe, result FROM f010 ORDER BY cond, probe;
ROLLBACK;
