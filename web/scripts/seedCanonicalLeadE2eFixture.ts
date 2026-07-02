/**
 * Seed one clean canonical enrollment lead for Phase 7 E2E QA (dry-run default).
 *
 * Usage:
 *   cd web && npx tsx scripts/seedCanonicalLeadE2eFixture.ts
 *   cd web && CANONICAL_E2E_SEED_CONFIRM=APPLY_CANONICAL_LEAD_FIXTURE npx tsx scripts/seedCanonicalLeadE2eFixture.ts --apply
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CANONICAL_E2E_ORG_ID (optional — uses ALLOY_PUBLIC_ORG_ID)
 */

import { createClient } from "@supabase/supabase-js";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { buildCreateLeadOcmInsertRow } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import {
    validateCustomerMemberRowGrain,
    validateOcmRowGrain,
    validateOpportunityWritePayload,
} from "@/lib/fields/canonicalE2eValidators";
import { stripLegacyTextStatusFromWritePayload } from "@/lib/fields/canonicalLegacyStatusWrite";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Missing ${name}`);
    return v;
}

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.env.CANONICAL_E2E_SEED_CONFIRM === "APPLY_CANONICAL_LEAD_FIXTURE";

const FIXTURE_TAG = "canonical_e2e_phase7";
const GUARDIAN_EMAIL = "canonical-e2e-guardian@alloy-fixture.test";
const CHILD_FIRST = "Casey";
const CHILD_LAST = "Canonical";

async function main() {
    const orgId = process.env.CANONICAL_E2E_ORG_ID?.trim() || env("ALLOY_PUBLIC_ORG_ID");
    const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
    });

    const { data: vertical } = await supabase.from("verticals").select("id").eq("org_id", orgId).limit(1).maybeSingle();
    const verticalId = (vertical as { id?: string } | null)?.id ?? null;
    if (!verticalId) throw new Error(`No vertical for org ${orgId}`);

    const personPayload = {
        org_id: orgId,
        first_name: "Jordan",
        last_name: "Fixture",
        email: GUARDIAN_EMAIL,
        phone: "+15555550107",
        status_key: "active",
        metadata: { [FIXTURE_TAG]: true },
    };

    const customerPayload = {
        org_id: orgId,
        name: "Fixture Household (Canonical E2E)",
        customer_type: "household",
        status_key: "active",
        metadata: { [FIXTURE_TAG]: true },
    };

    const oppPayload: Record<string, unknown> = {
        org_id: orgId,
        vertical_id: verticalId,
        name: "Fixture Household — Canonical E2E Lead",
        source: "canonical_e2e_seed",
        status_key: NEW_LEAD_STATUS_KEY,
        metadata: { [FIXTURE_TAG]: true, created_via: FIXTURE_TAG },
    };
    stripLegacyTextStatusFromWritePayload(oppPayload);

    const cmPayload = {
        org_id: orgId,
        relationship: "child",
        first_name: CHILD_FIRST,
        last_name: CHILD_LAST,
        display_name: `${CHILD_FIRST} ${CHILD_LAST}`,
        dob: "2021-06-15",
        is_active: true,
        metadata: { [FIXTURE_TAG]: true, gender: "female", allergies: "none" },
    };

    console.log("=== Canonical E2E fixture plan (dry-run) ===");
    console.log("Org:", orgId);
    console.log("Guardian email:", GUARDIAN_EMAIL);
    console.log("Opportunity status_key:", NEW_LEAD_STATUS_KEY);
    console.log("Validation:", {
        opp: validateOpportunityWritePayload(oppPayload),
        cm: validateCustomerMemberRowGrain(cmPayload),
    });

    if (!APPLY || !CONFIRM) {
        console.log("\nDry-run only. To apply:");
        console.log("  CANONICAL_E2E_SEED_CONFIRM=APPLY_CANONICAL_LEAD_FIXTURE npx tsx scripts/seedCanonicalLeadE2eFixture.ts --apply");
        return;
    }

    const { data: person, error: pErr } = await supabase
        .from("persons")
        .insert(personPayload)
        .select("id")
        .single();
    if (pErr || !person) throw new Error(pErr?.message ?? "person insert failed");
    const personId = (person as { id: string }).id;

    const { data: customer, error: cErr } = await supabase
        .from("customers")
        .insert({ ...customerPayload, primary_contact_id: null })
        .select("id")
        .single();
    if (cErr || !customer) throw new Error(cErr?.message ?? "customer insert failed");
    const customerId = (customer as { id: string }).id;

    await supabase.from("customer_persons").insert({
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        role_type: "primary_guardian",
        is_primary: true,
    });

    const { data: opp, error: oErr } = await supabase
        .from("opportunities")
        .insert({
            ...oppPayload,
            customer_id: customerId,
            primary_person_id: personId,
            primary_contact_id: null,
        })
        .select("id, status_key")
        .single();
    if (oErr || !opp) throw new Error(oErr?.message ?? "opportunity insert failed");
    const opportunityId = (opp as { id: string }).id;

    const { data: cm, error: cmErr } = await supabase
        .from("customer_members")
        .insert({ ...cmPayload, customer_id: customerId, person_id: null })
        .select("id, first_name, last_name, dob")
        .single();
    if (cmErr || !cm) throw new Error(cmErr?.message ?? "customer_member insert failed");
    const customerMemberId = (cm as { id: string }).id;

    const ocmRow = buildCreateLeadOcmInsertRow({
        orgId,
        opportunityId,
        customerMemberId,
        ocm: {
            location_id: null,
            program_category_id: null,
            schedule_type: null,
            start_date: "2026-09-01",
            program_room_cohort_key: null,
            notes: "Phase 7 canonical fixture",
        },
    });
    const ocmIssues = validateOcmRowGrain(ocmRow);
    if (ocmIssues.length) throw new Error(`OCM validation failed: ${JSON.stringify(ocmIssues)}`);

    const { data: ocm, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .insert(ocmRow)
        .select("id, outcome_status_key, start_date")
        .single();
    if (ocmErr || !ocm) throw new Error(ocmErr?.message ?? "OCM insert failed");

    console.log("\n=== Applied canonical E2E fixture ===");
    console.log(JSON.stringify({ personId, customerId, opportunityId, customerMemberId, ocmId: (ocm as { id: string }).id }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
