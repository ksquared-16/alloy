/**
 * Diagnose Test 1C/1D visibility — compares DB rows vs dbListSubmissions per org.
 * Usage: cd web && npx tsx --tsconfig tsconfig.json scripts/diagnoseFormsSubmissionVisibility.ts
 */
import { createAdminClient } from "@/lib/supabaseAdmin";
import { dbListSubmissions } from "@/lib/admin/forms/formsAdminDb";
import { groupSubmissionsIntoInboxLanes, resolveSubmissionInboxLane } from "@/lib/forms/submissionInboxPresentation";
import {
    DEMO_CHILDCARE_ORG_ID,
    INTAKE_RUNTIME_TEST_1C_ID,
    INTAKE_RUNTIME_TEST_1D_ID,
    INTAKE_RUNTIME_TEST_FORM_ID,
    INTAKE_RUNTIME_TEST_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";

const TEST_IDS = [INTAKE_RUNTIME_TEST_1C_ID, INTAKE_RUNTIME_TEST_1D_ID];

async function auditOrg(label: string, orgId: string) {
    const supabase = createAdminClient();
    const { data: org } = await supabase.from("orgs").select("id,name,slug").eq("id", orgId).maybeSingle();
    console.log(`\n=== ${label}: ${org?.name ?? orgId} ===`);

    const { data: all, error } = await dbListSubmissions(supabase, orgId, { limit: 20 });
    if (error) {
        console.log("QUERY ERROR:", error.message);
        return;
    }
    console.log("submission count:", all?.length ?? 0);
    for (const r of all ?? []) {
        console.log(`  ${r.id.slice(0, 8)}… ${(r.submitted_at ?? r.created_at)?.slice(0, 10)} ${r.status}`);
    }
    for (const id of TEST_IDS) {
        const hit = all?.find((r) => r.id === id);
        console.log(`  ${id}: ${hit ? `FOUND lane=${resolveSubmissionInboxLane(hit)}` : "MISSING"}`);
    }
}

async function main() {
    const supabase = createAdminClient();

    for (const id of TEST_IDS) {
        const { data, error } = await supabase
            .from("form_submissions")
            .select("id, org_id, form_definition_id, status, submitted_at")
            .eq("id", id)
            .maybeSingle();
        console.log(`\n=== DB direct: ${id} ===`);
        if (error) console.log("error:", error.message);
        else console.log(JSON.stringify(data, null, 2));
    }

    await auditOrg("Alloy Bend (Test 1 fixtures)", INTAKE_RUNTIME_TEST_ORG_ID);
    await auditOrg("Demo Childcare Co (common browser session)", DEMO_CHILDCARE_ORG_ID);

    console.log("\n=== Alloy Bend form-scoped lanes ===");
    const { data: scoped, error: scopedErr } = await dbListSubmissions(supabase, INTAKE_RUNTIME_TEST_ORG_ID, {
        form_definition_id: INTAKE_RUNTIME_TEST_FORM_ID,
        limit: 200,
    });
    if (scopedErr) {
        console.log("QUERY ERROR:", scopedErr.message);
        process.exit(1);
    }
    const lanes = groupSubmissionsIntoInboxLanes(
        (scoped ?? []).map((r) => ({
            id: r.id,
            status: r.status,
            created_at: r.created_at,
            submitted_at: r.submitted_at,
            form_definition_id: r.form_definition_id,
            person_id: r.person_id,
            customer_id: r.customer_id,
            customer_member_id: r.customer_member_id,
            opportunity_id: r.opportunity_id,
            payload: r.payload as { meta?: Record<string, unknown> },
        }))
    );
    console.log("lanes:", {
        needsReview: lanes.needsReview.map((r) => r.id),
        needsLinking: lanes.needsLinking.map((r) => r.id),
        recentlySubmitted: lanes.recentlySubmitted.map((r) => r.id),
        drafts: lanes.drafts.map((r) => r.id),
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
