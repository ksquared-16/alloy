DO $d1_rls$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'processing_commit_plans',
        'processing_plan_operations',
        'processing_approvals'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_org', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY[''owner'',''admin'',''ops'',''manager'']));',
            t || '_select_org', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_all_service_role', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
            t || '_all_service_role', t);

        EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    END LOOP;
END;
$d1_rls$;
