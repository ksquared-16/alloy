-- Real transactional test of public.relationship_link_household_guardian (migration 20261125090000).
-- Runs entirely inside one transaction that is ROLLED BACK: nothing persists. Each scenario uses a
-- savepoint; the NOTICE "RESULT …" lines are the evidence. Usage (local certification stack):
--   docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - < this file
-- with the migration file concatenated before it (see the runner line in the PR).
CREATE TEMP TABLE t_out (n serial, line text);
CREATE TEMP TABLE t_ctx AS
SELECT (SELECT id FROM customer_members WHERE customer_id = '00000000-0000-4000-8000-000050000001' AND relationship = 'child' AND is_active ORDER BY id LIMIT 1) AS child,
       (SELECT id FROM customer_members WHERE customer_id = 'f7c015fa-0000-4000-8000-0000000c0001' AND relationship = 'child' AND is_active ORDER BY id LIMIT 1) AS foreign_child;
CREATE TEMP TABLE t_counts AS SELECT 0 AS persons, 0 AS contacts, 0 AS links, 0 AS cmc;
CREATE OR REPLACE FUNCTION pg_temp.snap() RETURNS void LANGUAGE sql AS $$
  UPDATE t_counts SET persons = (SELECT count(*) FROM persons WHERE phone LIKE '+1555019%'),
                      contacts = (SELECT count(*) FROM contacts WHERE phone LIKE '+1555019%'),
                      links = (SELECT count(*) FROM customer_persons cp JOIN persons p ON p.id = cp.person_id WHERE p.phone LIKE '+1555019%'),
                      cmc = (SELECT count(*) FROM customer_member_contacts x JOIN contacts c ON c.id = x.contact_id WHERE c.phone LIKE '+1555019%');
$$;
CREATE OR REPLACE FUNCTION pg_temp.counts() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM persons WHERE phone LIKE '+1555019%') || '/' || (SELECT count(*) FROM contacts WHERE phone LIKE '+1555019%') || '/'
      || (SELECT count(*) FROM customer_persons cp JOIN persons p ON p.id = cp.person_id WHERE p.phone LIKE '+1555019%') || '/'
      || (SELECT count(*) FROM customer_member_contacts x JOIN contacts c ON c.id = x.contact_id WHERE c.phone LIKE '+1555019%');
$$;
CREATE OR REPLACE FUNCTION pg_temp.call(p_member uuid, p_role text, p_person uuid, p_first text, p_last text, p_phone text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.relationship_link_household_guardian('00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000050000001'::uuid, ARRAY[p_member], p_role, p_person, p_first, p_last, NULL, p_phone, ARRAY[p_phone], 'test');
$$;

-- 1. success: new person, contact, household link, child link — all four
SAVEPOINT s1;
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.call((SELECT child FROM t_ctx), 'guardian', NULL, 'Gina', 'Guardian', '+15550190001');
  RAISE NOTICE 'RESULT %', '1 success: ' || r::text || ' counts=' || pg_temp.counts();
END $$;
-- 2. repeat: same household person reused, nothing new
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.call((SELECT child FROM t_ctx), 'guardian', NULL, 'Gina', 'Guardian', '+15550190001');
  RAISE NOTICE 'RESULT %', '2 repeat: ' || r::text || ' counts=' || pg_temp.counts();
END $$;
-- 3. ambiguous: same phone, different name -> refuses with candidates, writes nothing
DO $$ DECLARE d text; BEGIN
  PERFORM pg_temp.call((SELECT child FROM t_ctx), 'guardian', NULL, 'Other', 'Name', '+15550190001');
  RAISE NOTICE 'RESULT %', '3 FAIL ambiguous accepted';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL;
  RAISE NOTICE 'RESULT %', '3 ambiguous refused: ' || SQLERRM || ' candidates=' || jsonb_array_length(d::jsonb) || ' same_name=' || (d::jsonb -> 0 ->> 'same_name') || ' counts=' || pg_temp.counts();
END $$;
ROLLBACK TO SAVEPOINT s1;

-- 4. cross-household child -> refused before any write
DO $$ BEGIN
  PERFORM pg_temp.call((SELECT foreign_child FROM t_ctx), 'guardian', NULL, 'Gina', 'Guardian', '+15550190002');
  RAISE NOTICE 'RESULT %', '4 FAIL cross-household accepted';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT %', '4 cross-household refused: ' || SQLERRM || ' counts=' || pg_temp.counts();
END $$;
-- 5. no name -> refused, nothing written
DO $$ BEGIN
  PERFORM pg_temp.call((SELECT child FROM t_ctx), 'guardian', NULL, '', 'Guardian', '+15550190003');
  RAISE NOTICE 'RESULT %', '5 FAIL no name accepted';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT %', '5 missing identity refused: ' || SQLERRM || ' counts=' || pg_temp.counts();
END $$;
-- 6. no role -> refused
DO $$ BEGIN
  PERFORM pg_temp.call((SELECT child FROM t_ctx), '', NULL, 'Gina', 'Guardian', '+15550190004');
  RAISE NOTICE 'RESULT %', '6 FAIL no role accepted';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT %', '6 missing role refused: ' || SQLERRM || ' counts=' || pg_temp.counts();
END $$;
-- 7. ATOMICITY: the child-link write fails AFTER the person, contact and household link were inserted
SAVEPOINT s7;
CREATE OR REPLACE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected child-link failure'; END $$;
CREATE TRIGGER t_boom BEFORE INSERT ON public.customer_member_contacts FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
DO $$ BEGIN
  PERFORM pg_temp.call((SELECT child FROM t_ctx), 'guardian', NULL, 'Rolly', 'Back', '+15550190005');
  RAISE NOTICE 'RESULT %', '7 FAIL injected failure did not raise';
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_out(line) VALUES ('7 late failure rolled back: ' || SQLERRM || ' persons_with_phone=' || (SELECT count(*) FROM persons WHERE phone = '+15550190005')
      || ' contacts=' || (SELECT count(*) FROM contacts WHERE phone = '+15550190005') || ' counts=' || pg_temp.counts());
END $$;
DROP TRIGGER t_boom ON public.customer_member_contacts;
RELEASE SAVEPOINT s7;
-- 8. existing-person selection: an explicit org person is linked, not duplicated
SAVEPOINT s8;
DO $$ DECLARE pid uuid; r jsonb; BEGIN
  INSERT INTO persons (org_id, first_name, last_name, phone) VALUES ('00000000-0000-4000-8000-000000000001', 'Sel', 'Ected', '+15550190006') RETURNING id INTO pid;
  r := pg_temp.call((SELECT child FROM t_ctx), 'guardian', pid, NULL, NULL, NULL);
  RAISE NOTICE 'RESULT %', '8 selected person: reused=' || (r ->> 'person_reused') || ' same_id=' || ((r ->> 'person_id')::uuid = pid)::text || ' counts=' || pg_temp.counts();
END $$;
ROLLBACK TO SAVEPOINT s8;
-- 9. permissions: anon/authenticated cannot execute
INSERT INTO t_out(line) SELECT '9 grants: anon=' || has_function_privilege('anon', 'public.relationship_link_household_guardian(uuid,uuid,uuid[],text,uuid,text,text,text,text,text[],text)', 'EXECUTE')
  || ' authenticated=' || has_function_privilege('authenticated', 'public.relationship_link_household_guardian(uuid,uuid,uuid[],text,uuid,text,text,text,text,text[],text)', 'EXECUTE')
  || ' service_role=' || has_function_privilege('service_role', 'public.relationship_link_household_guardian(uuid,uuid,uuid[],text,uuid,text,text,text,text,text[],text)', 'EXECUTE');
SELECT line FROM t_out ORDER BY n;
