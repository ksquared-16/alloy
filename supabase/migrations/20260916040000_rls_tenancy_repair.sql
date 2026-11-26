-- RLS TENANCY REPAIR V1 — remove a dead cross-tenant predicate, and one tautology.
--
-- ============================================================================
-- WHAT THIS IS, AND WHAT IT IS NOT
-- ============================================================================
--
-- 51 tables carry write policies of this shape:
--
--     EXISTS (SELECT 1 FROM app_users au
--              WHERE au.id = auth.uid() AND au.role = ANY(ARRAY['admin','ops']))
--
-- There is no organization predicate, though both `app_users` and the target tables carry
-- `org_id`. Read literally, a titled principal in ANY organization satisfies it for rows in ANY
-- other. That is a tenancy shape, not a capability disagreement.
--
-- MEASURED BEFORE CHANGING ANYTHING, and it changes the severity: `app_users` is EMPTY on the
-- deployed database (0 rows, 0 with admin/ops, 0 organizations) and the product references it in
-- ZERO files. `user_roles` is the live identity table (15 rows, 13 admin-or-ops, 3 orgs). So the
-- predicate is currently UNSATISFIABLE: these policies grant nothing to anyone today. The defect is
-- LATENT, not live — and it would become live the moment anything populated that legacy table.
--
-- ============================================================================
-- WHY THIS DROPS POLICIES RATHER THAN ADDING TENANCY TO THEM
-- ============================================================================
--
-- The obvious repair — swap the predicate for `has_org_role(org_id, ARRAY['admin','ops'])` — would
-- be WRONG HERE, and in the dangerous direction. `has_org_role` resolves `user_roles`, which has 13
-- admin-or-ops principals. Today's predicate resolves `app_users`, which has none. "Adding tenancy"
-- would therefore convert 51 tables from DENY-EVERYONE into PERMIT-SAME-ORG-ADMIN: a widening
-- dressed as a security fix.
--
-- Model A says the browser gets in-organization READS and no direct writes, and that server
-- mutation goes through `service_role`. Dropping the dead grant is what that doctrine asks for, and
-- it is a strict narrowing under every reading:
--
--   * where the dead policy is the ONLY policy (11 tables), authenticated access was already nil
--     because the predicate is false; afterwards RLS denies by absence. Same effective behaviour.
--   * where correct org-scoped policies already exist (payments, vendors, opportunity_persons,
--     discount_*), permissive policies OR together — so the dead policy is a latent BYPASS of the
--     very `_same_org` checks beside it. Removing it is pure containment.
--
-- `service_role` has `rolbypassrls = true`, so no server path is affected by any of this. The four
-- server files that use the RLS-bound authenticated client touch `role_permission_grants`,
-- `user_roles` and `operational_expectations` — none of the tables below.
--
-- ============================================================================
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ============================================================================
--
--   * No capability appears in any policy. No `fin.*`, `work.*`, `tours.*`, `crm.*`,
--     `business_process.*`. Business authorization stays with route capabilities.
--   * No grant, role definition or default RBAC changes.
--   * The 15 `current_org_id()` policies are NOT touched. They return NULL in multi-org and
--     therefore deny — fail-closed, and a separate question from a cross-tenant permit.
--   * The 32 tables without a direct `org_id` are not given an invented tenancy. They do not need
--     one: removing a predicate that grants nothing requires no ownership model.
--   * `payment_provider_disputes` is not touched. Carried as PAYMENT_PROVIDER_DISPUTES_READ_BOUNDARY.
--
-- Enumerated deliberately below — no dynamic text-matching rewrite. `IF EXISTS` throughout, because
-- the certification database carries one policy the deployed database does not.

BEGIN;

-- access_methods
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.access_methods;   -- ALL

-- activity_log
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.activity_log;   -- ALL

-- addon_frequencies
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.addon_frequencies;   -- ALL

-- addon_types
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.addon_types;   -- ALL

-- app_users
DROP POLICY IF EXISTS "app_users_admin_write" ON public.app_users;   -- ALL

-- assignment_statuses
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.assignment_statuses;   -- ALL

-- assignments
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.assignments;   -- ALL

-- campaigns
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.campaigns;   -- ALL

-- cleaning_job_addons
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.cleaning_job_addons;   -- ALL

-- cleaning_job_details
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.cleaning_job_details;   -- ALL

-- cleaning_service_types
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.cleaning_service_types;   -- ALL

-- contact_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.contact_tags;   -- ALL

-- customer_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.customer_tags;   -- ALL

-- discount_applications
DROP POLICY IF EXISTS "discount_applications_admin_ops_full_access" ON public.discount_applications;   -- ALL

-- discount_commitments
DROP POLICY IF EXISTS "discount_commitments_admin_ops_full_access" ON public.discount_commitments;   -- ALL

-- discount_program_benefits
DROP POLICY IF EXISTS "discount_program_benefits_admin_ops_full_access" ON public.discount_program_benefits;   -- ALL

-- discount_program_commitment_rules
DROP POLICY IF EXISTS "discount_program_commitment_rules_admin_ops_full_access" ON public.discount_program_commitment_rules;   -- ALL

-- discount_program_qualifiers
DROP POLICY IF EXISTS "discount_program_qualifiers_admin_ops_full_access" ON public.discount_program_qualifiers;   -- ALL

-- discount_programs
DROP POLICY IF EXISTS "discount_programs_admin_ops_full_access" ON public.discount_programs;   -- ALL

-- discounts
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.discounts;   -- ALL

-- external_mappings
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.external_mappings;   -- ALL

-- home_types
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.home_types;   -- ALL

-- job_statuses
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.job_statuses;   -- ALL

-- job_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.job_tags;   -- ALL

-- jobs
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.jobs;   -- ALL

-- location_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.location_tags;   -- ALL

-- locations
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.locations;   -- ALL

-- messages
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.messages;   -- ALL

-- opportunity_persons
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.opportunity_persons;   -- ALL

-- opportunity_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.opportunity_tags;   -- ALL

-- payment_statuses
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.payment_statuses;   -- ALL

-- payments
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.payments;   -- ALL

-- pipeline_stages
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.pipeline_stages;   -- ALL

-- pipelines
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.pipelines;   -- ALL

-- pricing_addons
DROP POLICY IF EXISTS "pricing_addons_read" ON public.pricing_addons;   -- SELECT
DROP POLICY IF EXISTS "pricing_addons_write" ON public.pricing_addons;   -- ALL
DROP POLICY IF EXISTS "pricing_admin_delete_addons" ON public.pricing_addons;   -- DELETE
DROP POLICY IF EXISTS "pricing_admin_insert_addons" ON public.pricing_addons;   -- INSERT
DROP POLICY IF EXISTS "pricing_admin_update_addons" ON public.pricing_addons;   -- UPDATE

-- pricing_first_clean_prices
DROP POLICY IF EXISTS "pricing_admin_delete_first_clean" ON public.pricing_first_clean_prices;   -- DELETE
DROP POLICY IF EXISTS "pricing_admin_insert_first_clean" ON public.pricing_first_clean_prices;   -- INSERT
DROP POLICY IF EXISTS "pricing_admin_update_first_clean" ON public.pricing_first_clean_prices;   -- UPDATE
DROP POLICY IF EXISTS "pricing_first_read" ON public.pricing_first_clean_prices;   -- SELECT
DROP POLICY IF EXISTS "pricing_first_write" ON public.pricing_first_clean_prices;   -- ALL

-- pricing_frequencies
DROP POLICY IF EXISTS "pricing_admin_delete_frequencies" ON public.pricing_frequencies;   -- DELETE
DROP POLICY IF EXISTS "pricing_admin_insert_frequencies" ON public.pricing_frequencies;   -- INSERT
DROP POLICY IF EXISTS "pricing_admin_update_frequencies" ON public.pricing_frequencies;   -- UPDATE
DROP POLICY IF EXISTS "pricing_freq_read" ON public.pricing_frequencies;   -- SELECT
DROP POLICY IF EXISTS "pricing_freq_write" ON public.pricing_frequencies;   -- ALL

-- pricing_recurring_prices
DROP POLICY IF EXISTS "pricing_admin_delete_recurring" ON public.pricing_recurring_prices;   -- DELETE
DROP POLICY IF EXISTS "pricing_admin_insert_recurring" ON public.pricing_recurring_prices;   -- INSERT
DROP POLICY IF EXISTS "pricing_admin_update_recurring" ON public.pricing_recurring_prices;   -- UPDATE
DROP POLICY IF EXISTS "pricing_recurring_read" ON public.pricing_recurring_prices;   -- SELECT
DROP POLICY IF EXISTS "pricing_recurring_write" ON public.pricing_recurring_prices;   -- ALL

-- pricing_services
DROP POLICY IF EXISTS "pricing_admin_delete_services" ON public.pricing_services;   -- DELETE
DROP POLICY IF EXISTS "pricing_admin_insert_services" ON public.pricing_services;   -- INSERT
DROP POLICY IF EXISTS "pricing_admin_update_services" ON public.pricing_services;   -- UPDATE
DROP POLICY IF EXISTS "pricing_services_read" ON public.pricing_services;   -- SELECT
DROP POLICY IF EXISTS "pricing_services_write" ON public.pricing_services;   -- ALL

-- pricing_square_footage_tiers
DROP POLICY IF EXISTS "pricing_admin_delete_sqft" ON public.pricing_square_footage_tiers;   -- DELETE
DROP POLICY IF EXISTS "pricing_admin_insert_sqft" ON public.pricing_square_footage_tiers;   -- INSERT
DROP POLICY IF EXISTS "pricing_admin_update_sqft" ON public.pricing_square_footage_tiers;   -- UPDATE
DROP POLICY IF EXISTS "pricing_sqft_read" ON public.pricing_square_footage_tiers;   -- SELECT
DROP POLICY IF EXISTS "pricing_sqft_write" ON public.pricing_square_footage_tiers;   -- ALL

-- quotes
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.quotes;   -- ALL

-- recurrence_plans
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.recurrence_plans;   -- ALL

-- schedule_statuses
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.schedule_statuses;   -- ALL

-- schedule_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.schedule_tags;   -- ALL

-- schedules
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.schedules;   -- ALL

-- sqft_bands
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.sqft_bands;   -- ALL

-- tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.tags;   -- ALL

-- vendor_tags
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.vendor_tags;   -- ALL

-- vendor_users
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.vendor_users;   -- ALL

-- vendors
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.vendors;   -- ALL

-- verticals
DROP POLICY IF EXISTS "admin_ops_full_access" ON public.verticals;   -- ALL

-- ----------------------------------------------------------------------------
-- app_users' own read policy: keep the half that works, drop the half that does not.
--
-- `app_users_read_self_or_admin` is `(id = auth.uid()) OR EXISTS(<dead admin check>)`. The first
-- clause is satisfiable and is a legitimate self-read; the second is the dead predicate. Dropping
-- the whole policy would remove a working clause, so it is replaced rather than deleted.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "app_users_read_self_or_admin" ON public.app_users;
DROP POLICY IF EXISTS "app_users_read_self" ON public.app_users;   -- idempotent re-apply
CREATE POLICY "app_users_read_self" ON public.app_users
    FOR SELECT USING (id = auth.uid());

-- ----------------------------------------------------------------------------
-- work_units: two policies compare `d.org_id = d.org_id`, which is always true.
--
-- The SELECT policy on the same table gets it right (`d.org_id = work_units.org_id`), so the
-- correct comparison is not in doubt — it is taken from the neighbouring policy rather than
-- invented. The surviving tenant check is `org_id = current_org_id()`, which is left exactly as it
-- is: this repair removes a nonsense predicate, it does not change the tenancy mechanism.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_units_insert_same_org" ON public.work_units;
CREATE POLICY "work_units_insert_same_org" ON public.work_units
    FOR INSERT WITH CHECK (
        org_id = current_org_id()
        AND EXISTS (SELECT 1 FROM public.departments d
                     WHERE d.id = work_units.department_id
                       AND d.org_id = work_units.org_id)
    );

DROP POLICY IF EXISTS "work_units_update_same_org" ON public.work_units;
CREATE POLICY "work_units_update_same_org" ON public.work_units
    FOR UPDATE USING (org_id = current_org_id())
    WITH CHECK (
        org_id = current_org_id()
        AND EXISTS (SELECT 1 FROM public.departments d
                     WHERE d.id = work_units.department_id
                       AND d.org_id = work_units.org_id)
    );

-- ----------------------------------------------------------------------------
-- THE SAME DEFECT, A DIFFERENT DEAD TABLE — found by re-measuring, not inherited.
--
-- The brief named the `app_users` family. Sweeping for the SHAPE rather than the table name found
-- three more policies with identical structure keyed on `user_profiles`:
--
--     EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin')
--
-- on `workflows`, `workflow_actions` and `workflow_conditions` — all three of which DO carry
-- `org_id`, and none of which name it. `user_profiles` is also empty (0 rows) and has no `org_id`
-- column at all: another dead legacy identity table superseded by `user_roles`.
--
-- Same class, same evidence, same treatment. Workflow configuration authority is unaffected: it
-- lives on the route as `ops.workflows.write` and this migration does not touch it.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_full_access_workflows" ON public.workflows;
DROP POLICY IF EXISTS "admin_full_access_workflow_actions" ON public.workflow_actions;
DROP POLICY IF EXISTS "admin_full_access_workflow_conditions" ON public.workflow_conditions;

-- ----------------------------------------------------------------------------
-- SELF-TEST. Aborts the migration rather than reporting success it cannot prove.
-- ----------------------------------------------------------------------------
DO $rlstenancy$
DECLARE
    v_dead    int;
    v_taut    int;
    v_cap     int;
    v_selfread int;
BEGIN
    SELECT count(*) INTO v_dead FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%app_users%'
       AND (coalesce(qual,'') || coalesce(with_check,'')) NOT LIKE '%org_id%'
       AND (coalesce(qual,'') || coalesce(with_check,'')) NOT LIKE '%has_org_role%';
    IF v_dead <> 0 THEN
        RAISE EXCEPTION 'RLS TENANCY ABORT: % policies still carry the un-tenanted app_users predicate', v_dead;
    END IF;

    SELECT count(*) INTO v_dead FROM pg_policies
     WHERE schemaname = 'public' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
       AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(user_profiles|app_users)'
       AND (coalesce(qual,'') || coalesce(with_check,'')) NOT LIKE '%org_id%'
       AND (coalesce(qual,'') || coalesce(with_check,'')) NOT LIKE '%has_org_role%';
    IF v_dead <> 0 THEN
        RAISE EXCEPTION 'RLS TENANCY ABORT: % write policies still key on a dead identity table without tenancy', v_dead;
    END IF;

    SELECT count(*) INTO v_taut FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)' OR with_check ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)');
    IF v_taut <> 0 THEN
        RAISE EXCEPTION 'RLS TENANCY ABORT: % policies still compare a column to itself', v_taut;
    END IF;

    -- Business authority must NOT have moved into RLS. This is the invariant the slice is defined by.
    SELECT count(*) INTO v_cap FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(fin|work|tours|crm|reports|business_process|ai)\.[a-z_]+';
    IF v_cap <> 0 THEN
        RAISE EXCEPTION 'RLS TENANCY ABORT: % policies reference a business capability; this slice must not move authority into RLS', v_cap;
    END IF;

    SELECT count(*) INTO v_selfread FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'app_users' AND policyname = 'app_users_read_self';
    IF v_selfread <> 1 THEN
        RAISE EXCEPTION 'RLS TENANCY ABORT: the app_users self-read clause was not preserved';
    END IF;
END
$rlstenancy$;

COMMIT;
