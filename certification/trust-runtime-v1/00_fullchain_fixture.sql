-- Full-chain tenancy fixture for the Slice 1 invariant suite.
--
-- The isolated fixture (00_fixture.sql) invents `public.orgs` so the Trust
-- invariants can be proven without the rest of the schema. This file is its
-- full-chain counterpart: the schema already exists because all 306 migrations
-- have been replayed, so the only thing needed is two tenants with the UUIDs
-- 01_slice1_invariants.sql expects. Nothing here creates a Trust object; if the
-- Trust migration did not run, this file cannot make the suite pass.
INSERT INTO public.orgs (id, name, slug, status)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Trust Cert Org A', 'trust-cert-org-a', 'active'),
    ('99999999-9999-9999-9999-999999999999', 'Trust Cert Org B', 'trust-cert-org-b', 'active')
ON CONFLICT (id) DO NOTHING;

-- Fail loudly rather than silently certifying against an absent migration.
DO $fixture$
DECLARE
    v_tables integer;
BEGIN
    SELECT count(*) INTO v_tables
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('trust_decision_contracts','trust_decision_packages',
                         'trust_decision_observations','trust_reasoning_usage');
    IF v_tables <> 4 THEN
        RAISE EXCEPTION 'FIXTURE FAIL: % of 4 Trust tables present — the migration chain did not include the Trust migration', v_tables;
    END IF;
    RAISE NOTICE 'fixture ok — 4 Trust tables present in the full-chain schema';
END
$fixture$;
