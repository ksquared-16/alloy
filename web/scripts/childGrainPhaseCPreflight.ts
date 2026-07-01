/**
 * Phase C preflight — compare case-grain vs OCM/candidate-grain counts per lane.
 *
 * Usage (from web/):
 *   npx tsx scripts/childGrainPhaseCPreflight.ts
 *   npx tsx scripts/childGrainPhaseCPreflight.ts --org-id <uuid>
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or DATABASE_URL for raw SQL).
 * Does not modify data.
 */

import { createClient } from "@supabase/supabase-js";
import { ocmStatusKeysForEnrollmentTrackStage } from "../lib/queues/ocmEnrollmentTrackStageKeys";

const TOUR_CASE_STATUSES = ["tour_scheduled"];
const TOUR_FOLLOWUP_CASE_STATUSES = ["tour_completed", "follow_up_attempted", "tour_no_show"];
const ENROLLING_CARD8_STATUSES = ["offer_pending", "enrolling"];
const WAITLIST_OCM_STATUSES = ["waitlisted", "offer_pending"];

function parseArgs(): { orgId: string | null } {
    const args = process.argv.slice(2);
    let orgId: string | null = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--org-id" && args[i + 1]) {
            orgId = args[i + 1]!.trim();
            i++;
        }
    }
    return { orgId };
}

async function main() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
        console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { orgId: argOrgId } = parseArgs();

    let orgId = argOrgId;
    if (!orgId) {
        const { data: wuRow, error } = await supabase
            .from("work_units")
            .select("org_id, id, key")
            .eq("key", "enrollment_pipeline")
            .limit(1)
            .maybeSingle();
        if (error || !wuRow?.org_id) {
            console.error("Could not resolve org from enrollment_pipeline work unit", error?.message);
            process.exit(1);
        }
        orgId = wuRow.org_id as string;
        console.log(`Using org_id=${orgId} (first enrollment_pipeline WU ${wuRow.id})`);
    }

    const { data: workUnits, error: wuErr } = await supabase
        .from("work_units")
        .select("id, key, name")
        .eq("org_id", orgId)
        .eq("key", "enrollment_pipeline");
    if (wuErr || !workUnits?.length) {
        console.error("No enrollment_pipeline work unit for org", wuErr?.message);
        process.exit(1);
    }

    const workUnitId = workUnits[0]!.id as string;
    console.log(`work_unit_id=${workUnitId}\n`);

    async function countOpportunities(statusKeys: string[]): Promise<number> {
        const { count, error } = await supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId!)
            .eq("work_unit_id", workUnitId)
            .in("status_key", statusKeys);
        if (error) throw new Error(error.message);
        return count ?? 0;
    }

    async function countOcm(statusKeys: string[]): Promise<number> {
        const { count, error } = await supabase
            .from("opportunity_customer_members")
            .select("id, opportunities!inner(work_unit_id)", { count: "exact", head: true })
            .eq("org_id", orgId!)
            .eq("opportunities.work_unit_id", workUnitId)
            .in("outcome_status_key", statusKeys);
        if (error) throw new Error(error.message);
        return count ?? 0;
    }

    async function countCandidates(): Promise<number> {
        const { count, error } = await supabase
            .from("placement_candidates")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId!)
            .in("status", ["active", "paused"]);
        if (error) throw new Error(error.message);
        return count ?? 0;
    }

    async function sampleOcm(statusKeys: string[], limit = 3) {
        const { data, error } = await supabase
            .from("opportunity_customer_members")
            .select(
                "id, opportunity_id, outcome_status_key, location_id, opportunities!inner(id, status_key, title, name)",
            )
            .eq("org_id", orgId!)
            .eq("opportunities.work_unit_id", workUnitId)
            .in("outcome_status_key", statusKeys)
            .limit(limit);
        if (error) throw new Error(error.message);
        return data ?? [];
    }

    async function sampleOpportunities(statusKeys: string[], limit = 3) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, status_key, title, name")
            .eq("org_id", orgId!)
            .eq("work_unit_id", workUnitId)
            .in("status_key", statusKeys)
            .limit(limit);
        if (error) throw new Error(error.message);
        return data ?? [];
    }

    const tourOcmKeys = [...ocmStatusKeysForEnrollmentTrackStage("tour")];
    const enrollingOcmKeys = [...ocmStatusKeysForEnrollmentTrackStage("enrolling")];
    const enrolledOcmKeys = [...ocmStatusKeysForEnrollmentTrackStage("enrolled")];

    const rows: Array<{
        lane: string;
        currentPath: string;
        currentCount: number;
        flagPath: string;
        flagCount: number;
        delta: number;
    }> = [];

    const enrolledCase = await countOpportunities(["enrolled"]);
    const enrolledOcm = await countOcm(enrolledOcmKeys);
    rows.push({
        lane: "Enrolled",
        currentPath: "case opportunities.status_key=enrolled",
        currentCount: enrolledCase,
        flagPath: "OCM outcome_status_key=enrolled",
        flagCount: enrolledOcm,
        delta: enrolledOcm - enrolledCase,
    });

    const enrollingCurrent = await countOcm(ENROLLING_CARD8_STATUSES);
    const enrollingFlag = await countOcm(enrollingOcmKeys);
    rows.push({
        lane: "Enrolling",
        currentPath: "Card8 OCM offer_pending+enrolling (already child-grain)",
        currentCount: enrollingCurrent,
        flagPath: "Phase A OCM enrolling disposition set",
        flagCount: enrollingFlag,
        delta: enrollingFlag - enrollingCurrent,
    });

    const tourCase = await countOpportunities(TOUR_CASE_STATUSES);
    const tourOcm = await countOcm(tourOcmKeys);
    rows.push({
        lane: "Tour (tours)",
        currentPath: "case opportunities.status_key=tour_scheduled",
        currentCount: tourCase,
        flagPath: "OCM tour disposition set",
        flagCount: tourOcm,
        delta: tourOcm - tourCase,
    });

    const tourFollowCase = await countOpportunities(TOUR_FOLLOWUP_CASE_STATUSES);
    rows.push({
        lane: "Tour (tours_follow_up)",
        currentPath: "case tour_completed/follow_up/tour_no_show",
        currentCount: tourFollowCase,
        flagPath: "same OCM tour set (subset)",
        flagCount: tourOcm,
        delta: tourOcm - tourFollowCase,
    });

    const waitlistCandidates = await countCandidates();
    const waitlistOcm = await countOcm(WAITLIST_OCM_STATUSES);
    rows.push({
        lane: "Waitlist",
        currentPath: "Card6 placement_candidates active+paused (already candidate-grain)",
        currentCount: waitlistCandidates,
        flagPath: "OCM waitlisted+offer_pending (reference only)",
        flagCount: waitlistOcm,
        delta: waitlistOcm - waitlistCandidates,
    });

    console.log("Lane comparison (counts):\n");
    console.table(rows);

    console.log("\nSample Enrolled case rows:");
    for (const o of await sampleOpportunities(["enrolled"])) {
        console.log(`  opp:${o.id} status=${o.status_key} title=${o.title ?? o.name}`);
    }

    console.log("\nSample Enrolled OCM rows (would add ocmrow ids):");
    for (const ocm of await sampleOcm(enrolledOcmKeys)) {
        const opp = (ocm as { opportunities?: { status_key?: string } }).opportunities;
        console.log(
            `  ocmrow:${ocm.opportunity_id}:${ocm.id} ocm_status=${ocm.outcome_status_key} opp_status=${opp?.status_key ?? "?"} loc=${ocm.location_id ?? "—"}`,
        );
    }

    console.log("\nSample Tour case-only (in case lane, may miss child touring):");
    for (const o of await sampleOpportunities(TOUR_CASE_STATUSES)) {
        console.log(`  opp:${o.id} status=${o.status_key}`);
    }

    console.log("\nSample Tour OCM rows not in tour_scheduled case:");
    const tourOcmSamples = await sampleOcm(tourOcmKeys, 5);
    for (const ocm of tourOcmSamples) {
        const opp = (ocm as { opportunities?: { status_key?: string } }).opportunities;
        if (opp?.status_key === "tour_scheduled") continue;
        console.log(
            `  ocmrow:${ocm.opportunity_id}:${ocm.id} ocm=${ocm.outcome_status_key} opp_case_status=${opp?.status_key}`,
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
