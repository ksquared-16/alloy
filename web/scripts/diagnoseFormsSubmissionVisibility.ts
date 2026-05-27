/**
 * Diagnose Test 1C/1D visibility — compares DB rows vs dbListSubmissions for Alloy Bend org.
 * Usage: cd web && npx tsx --tsconfig tsconfig.json scripts/diagnoseFormsSubmissionVisibility.ts
 */
import { createAdminClient } from "@/lib/supabaseAdmin";
import { dbListSubmissions } from "@/lib/admin/forms/formsAdminDb";
import { groupSubmissionsIntoInboxLanes, resolveSubmissionInboxLane } from "@/lib/forms/submissionInboxPresentation";

const ALLOY_BEND_ORG = "7803388d-cdee-4afb-89cf-23a137f39423";
const FORM_ID = "e68e0160-3157-44fd-b207-2c0f14d1764f";
const TEST_IDS = ["c5e2e078-97ee-4e17-9d66-1527a9f0c46b", "50ac6911-5887-4934-9ae8-a221d61f81f6"];

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

    console.log("\n=== dbListSubmissions (org-wide limit 200) ===");
    const { data: all, error: allErr } = await dbListSubmissions(supabase, ALLOY_BEND_ORG, { limit: 200 });
    if (allErr) {
        console.log("QUERY ERROR:", allErr.message, allErr.code, allErr.details);
        process.exit(1);
    }
    console.log("row count:", all?.length ?? 0);
    for (const id of TEST_IDS) {
        const hit = all?.find((r) => r.id === id);
        console.log(id, hit ? `FOUND lane=${resolveSubmissionInboxLane(hit)}` : "MISSING from API query");
    }

    console.log("\n=== dbListSubmissions (form-scoped) ===");
    const { data: scoped, error: scopedErr } = await dbListSubmissions(supabase, ALLOY_BEND_ORG, {
        form_definition_id: FORM_ID,
        limit: 200,
    });
    if (scopedErr) {
        console.log("QUERY ERROR:", scopedErr.message);
        process.exit(1);
    }
    console.log("row count:", scoped?.length ?? 0);
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
