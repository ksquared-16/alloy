-- =============================================================================
-- MEDICAL ACCESS — child health facts are readable only through Medical's permission.
--
-- `person_health_facts` (allergies, conditions, medications, immunizations, insurance) was
-- granted SELECT to `authenticated` under the policy `org_id = current_org_id()` — a stopgap
-- recorded in 20260826120000 "until D-H6 lands". D-H6 landed (`health.view` / `health.manage`),
-- but the stopgap stayed. `current_org_id()` returns the org whenever `orgs` holds one row and
-- never looks at the caller, so in a single-org deployment ANY signed-in browser session —
-- including a user with no role and an operator without `health.view` — could read every
-- child's health facts straight from PostgREST.
--
-- The application already reads and writes these rows only through the service role, behind
-- `assertHealthAccess` (health card, collection resolver, health-fact service, Processing
-- commits). This migration makes the database say the same thing, matching
-- `person_medical_consents` (20261202090000): no browser principal reaches the rows at all.
--
-- Re-runnable: every statement is idempotent.
-- =============================================================================

DROP POLICY IF EXISTS person_health_facts_same_org_select ON public.person_health_facts;

REVOKE ALL ON public.person_health_facts FROM PUBLIC;
REVOKE ALL ON public.person_health_facts FROM anon;
REVOKE ALL ON public.person_health_facts FROM authenticated;
GRANT ALL ON public.person_health_facts TO service_role;

ALTER TABLE public.person_health_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_health_facts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_health_facts_service_role_all ON public.person_health_facts;
CREATE POLICY person_health_facts_service_role_all ON public.person_health_facts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Self-verification: the migration refuses to succeed unless the end state is the intended one.
DO $verify$
DECLARE
    v_priv text;
BEGIN
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF has_table_privilege('authenticated', 'public.person_health_facts', v_priv) THEN
            RAISE EXCEPTION 'person_health_facts: authenticated still holds %', v_priv;
        END IF;
        IF has_table_privilege('anon', 'public.person_health_facts', v_priv) THEN
            RAISE EXCEPTION 'person_health_facts: anon still holds %', v_priv;
        END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role', 'public.person_health_facts', 'SELECT') THEN
        RAISE EXCEPTION 'person_health_facts: service_role lost SELECT';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.person_health_facts'::regclass
          AND polname <> 'person_health_facts_service_role_all'
    ) THEN
        RAISE EXCEPTION 'person_health_facts: a policy other than the service-role policy remains';
    END IF;
END
$verify$;
