-- BP V2 Slice 1 — publication proof for a domain-projection process, against the CURRENT
-- publish_business_process_revision_v1 on a real Alloy schema (the local certification stack).
--
-- Isolation: ONE transaction that always ROLLs BACK. It creates a throwaway org and two departments,
-- publishes Assignments and Billing shells through the real RPC, reads back what the runtime reads
-- (departments.metadata.lifecycle_builder_v1), and leaves nothing behind. No existing row is touched.
--
-- Run: psql -v ON_ERROR_STOP=1 -qtAX -f s1-publication-rollback.sql
-- Each check prints `PASS <name>` or aborts the transaction with `FAIL <name>`.

BEGIN;

CREATE TEMP TABLE s1_ids ON COMMIT DROP AS
SELECT gen_random_uuid() AS org_id, gen_random_uuid() AS assignments_dept, gen_random_uuid() AS billing_dept;

INSERT INTO public.orgs (id, name, slug)
SELECT org_id, 'BP V2 S1 rollback fixture', 'bpv2-s1-fixture-' || substr(org_id::text, 1, 8) FROM s1_ids;

INSERT INTO public.departments (id, org_id, key, name, is_active, metadata)
SELECT assignments_dept, org_id, 'assignments', 'Assignments', true, '{}'::jsonb FROM s1_ids
UNION ALL
SELECT billing_dept, org_id, 'billing', 'Billing', true, '{}'::jsonb FROM s1_ids;

-- The draft the TS gate validated (validateBusinessProcessForPublish → no errors): a stage-less shell
-- that declares its model and claims no primary entity.
INSERT INTO public.business_process_drafts (org_id, department_id, payload, draft_status, validated_at)
SELECT org_id, dept, jsonb_build_object(
           'version', 1,
           'active_process_id', 'proc-' || domain,
           'processes', jsonb_build_array(jsonb_build_object(
               'id', 'proc-' || domain,
               'key', domain,
               'name', initcap(domain),
               'process_model_v1', jsonb_build_object('kind', 'domain_projection', 'domain', domain),
               'sort_order', 0,
               'is_active', true,
               'stages', '[]'::jsonb))),
       'validated', now()
FROM s1_ids, LATERAL (VALUES (assignments_dept, 'assignments'), (billing_dept, 'billing')) AS d(dept, domain);

CREATE TEMP TABLE s1_results ON COMMIT DROP AS
SELECT d.dept, d.domain,
       public.publish_business_process_revision_v1(s.org_id, d.dept, NULL, 'bpv2-s1-' || d.domain) AS result
FROM s1_ids s, LATERAL (VALUES (s.assignments_dept, 'assignments'), (s.billing_dept, 'billing')) AS d(dept, domain);

DO $$
DECLARE
    r record;
    v_proc jsonb;
    v_rev integer;
BEGIN
    FOR r IN SELECT * FROM s1_results LOOP
        IF (r.result ->> 'revision_number')::int <> 1 OR coalesce((r.result ->> 'already_published')::boolean, false) THEN
            RAISE EXCEPTION 'FAIL % first publish -> revision 1 (got %)', r.domain, r.result;
        END IF;
        RAISE NOTICE 'PASS % first publish -> revision 1', r.domain;

        SELECT dp.metadata -> 'lifecycle_builder_v1' -> 'processes' -> 0 INTO v_proc
        FROM public.departments dp WHERE dp.id = r.dept;
        IF v_proc -> 'process_model_v1' IS DISTINCT FROM jsonb_build_object('kind', 'domain_projection', 'domain', r.domain) THEN
            RAISE EXCEPTION 'FAIL % runtime projection carries process_model_v1 (got %)', r.domain, v_proc;
        END IF;
        RAISE NOTICE 'PASS % runtime projection carries process_model_v1', r.domain;

        IF v_proc ? 'primary_entity' THEN
            RAISE EXCEPTION 'FAIL % projection claims a primary entity (%)', r.domain, v_proc -> 'primary_entity';
        END IF;
        RAISE NOTICE 'PASS % projection claims no Opportunity / Lead primary entity', r.domain;

        IF jsonb_array_length(v_proc -> 'stages') <> 0 THEN
            RAISE EXCEPTION 'FAIL % no synthetic stages persisted', r.domain;
        END IF;
        RAISE NOTICE 'PASS % no synthetic stages persisted', r.domain;

        SELECT count(*) INTO v_rev FROM public.configuration_publications cp
        WHERE cp.domain_key = 'business_process' AND cp.subject_id = r.dept;
        IF v_rev <> 1 THEN
            RAISE EXCEPTION 'FAIL % publication recorded on the generic table (%)', r.domain, v_rev;
        END IF;
        RAISE NOTICE 'PASS % publication recorded on the generic table', r.domain;
    END LOOP;

    -- The two departments are distinct subjects: neither publication touched the other.
    IF (SELECT count(DISTINCT dept) FROM s1_results) <> 2 THEN
        RAISE EXCEPTION 'FAIL two distinct department subjects';
    END IF;
    RAISE NOTICE 'PASS two distinct department subjects, one revision each';
END $$;

ROLLBACK;

-- After rollback: nothing from the fixture survives.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.orgs WHERE name = 'BP V2 S1 rollback fixture') THEN
        RAISE EXCEPTION 'FAIL fixture rolled back';
    END IF;
    RAISE NOTICE 'PASS fixture rolled back — no rows survive';
END $$;
