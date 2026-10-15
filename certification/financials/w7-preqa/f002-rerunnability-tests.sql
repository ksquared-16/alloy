\set ON_ERROR_STOP 1
BEGIN;
-- (a) 140000 re-run on a database where it is fully present (staging's state)
\i /m140.sql
-- (b) 140000 after the exact partial the host left (statements through line 170, the DROP)
DROP TRIGGER IF EXISTS trg_enforce_money_capable_role_grant_person_links ON public.role_permission_grants;
\i /p140.sql
\i /m140.sql
-- (c) 150000 after a partial (everything through its DROP TRIGGER), then whole, then whole again
\i /p150.sql
\i /m150.sql
\i /m150.sql
SELECT 'state', (SELECT count(*) FROM pg_trigger WHERE tgname='trg_enforce_money_capable_role_grant_person_links' AND NOT tgisinternal),
                (SELECT count(*) FROM pg_trigger WHERE tgname='trg_enforce_user_roles_money_capable_person_link' AND NOT tgisinternal),
                position('alloy.money_link_judged' IN pg_get_functiondef('public.assert_assignment_delegation_ceiling(uuid,text,uuid,text[])'::regprocedure)) > 0;
ROLLBACK;
