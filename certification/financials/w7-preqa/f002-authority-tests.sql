\set ON_ERROR_STOP 1
BEGIN;
\i /mig150.sql
\i /mig150.sql
CREATE TEMP TABLE outcome (case_name text, result text);
CREATE OR REPLACE FUNCTION pg_temp.try(p_case text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_result text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    v_result := 'ALLOWED';
    RAISE EXCEPTION 'rollback_probe';      -- undo the probe's own effect
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_probe' THEN v_result := 'REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  INSERT INTO outcome VALUES (p_case, v_result);
END $$;
-- fixtures (inside the rolled-back transaction)
INSERT INTO persons (id, org_id, first_name, last_name) VALUES ('f0020000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Named','Probe');
SELECT pg_temp.try('1 direct: unlinked user + money role (admin)',
  $q$INSERT INTO user_roles (org_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','admin')$q$);
SELECT pg_temp.try('2 direct: unlinked user + non-money role',
  $q$INSERT INTO user_roles (org_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','mcert_ax_auditor')$q$);
SELECT pg_temp.try('3 governed assign RPC: unlinked + money role',
  $q$SELECT assign_member_role_audited('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','admin','00000000-0000-4000-8000-000000000002','operator','t3')$q$);
SELECT pg_temp.try('4 unattributed assign RPC: unlinked + money role (was a bypass)',
  $q$SELECT assign_member_role_audited('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','admin',NULL,'operator','t4')$q$);
SELECT pg_temp.try('5 governed replace: EXISTING unlinked admin re-saved as admin (must not strand)',
  $q$SELECT replace_membership_with_access_profile('72f10cc6-fbd2-4b3c-a107-8a5c196da384','00000000-0000-4000-8000-000000000001','admin','00000000-0000-4000-8000-000000000002','operator','t5')$q$);
SELECT pg_temp.try('6 direct: existing unlinked admin adds a role whose money keys it already holds',
  $q$INSERT INTO user_roles (org_id,user_id,role) SELECT '00000000-0000-4000-8000-000000000001','72f10cc6-fbd2-4b3c-a107-8a5c196da384', g.role_key FROM role_permission_grants g WHERE g.org_id='00000000-0000-4000-8000-000000000001' AND g.allowed AND g.permission_key='fin.write' AND g.role_key<>'admin' LIMIT 1$q$);
SELECT pg_temp.try('7 role definition: newly allow fin.write on a role with an unlinked holder',
  $q$INSERT INTO role_permission_grants (org_id,role_key,permission_key,allowed) VALUES ('00000000-0000-4000-8000-000000000001','mcert_ax_auditor','fin.write',true)$q$);
SELECT pg_temp.try('8 role definition: re-save an already-allowed fin.write on admin',
  $q$INSERT INTO role_permission_grants (org_id,role_key,permission_key,allowed) VALUES ('00000000-0000-4000-8000-000000000001','admin','fin.write',true) ON CONFLICT (org_id,role_key,permission_key) DO UPDATE SET allowed=true$q$);
-- link the target, then the money cases again
INSERT INTO user_person_links (org_id,user_id,person_id,status,note) VALUES ('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','f0020000-0000-4000-8000-000000000001','active','probe');
SELECT pg_temp.try('9 direct: LINKED user + money role',
  $q$INSERT INTO user_roles (org_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','admin')$q$);
SELECT pg_temp.try('10 governed assign RPC: LINKED + money role',
  $q$SELECT assign_member_role_audited('00000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000d0c4','admin','00000000-0000-4000-8000-000000000002','operator','t10')$q$);
SELECT * FROM outcome ORDER BY case_name::text COLLATE "C";
SELECT 'acl_user_has_active_person_link', has_function_privilege('authenticated','public.user_has_active_person_link(uuid,uuid)','EXECUTE');
SELECT 'triggers_on_user_roles', count(*) FROM pg_trigger WHERE tgname='trg_enforce_user_roles_money_capable_person_link' AND NOT tgisinternal;
ROLLBACK;
