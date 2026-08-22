#!/usr/bin/env npx tsx
/**
 * GOVERNED duplicate placement candidate reconciliation (Priority 4).
 *
 * Every survivor here is NAMED, with a reason. The reconciliation owner is fail-closed and will skip
 * any subject it is not given an explicit decision for — an implicit default ("earliest", "currently
 * projecting") is the rule that oscillated on live data and damaged this tenant once already.
 *
 * PassA is deliberately ABSENT: its pin sits on the candidate that does not project, its `wait_since`
 * values differ by a day, and its two candidates hold different cohorts — so the survivor choice
 * changes queue seniority AND section membership AND requires rebinding a cohort-scoped override onto
 * a candidate in a different cohort. That is a product decision, not an engineering one.
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> DRY_RUN=1 npx tsx scripts/reconcilePlacementDuplicates.ts
 *   ORG_ID=<uuid> APPLY=1  npx tsx scripts/reconcilePlacementDuplicates.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    placementCandidateSubjectKey,
    retireDuplicateActiveCandidates,
} from "@/lib/orchestration/placement/placementCandidateSubjectUniqueness";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const OPPORTUNITY = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";

type Decision = {
    child: string;
    customer_member_id: string;
    survivor: string;
    losers: string[];
    reason: string;
    klass: string;
};

const DECISIONS: readonly Decision[] = [
    {
        child: "Lennon Kurzman",
        customer_member_id: "b247b8a3-7df7-4919-9309-698796b59c3b",
        survivor: "ba8cdcf5-73b2-43e6-8a86-aa28f1098c0e",
        losers: ["27de6932-6910-4498-9f5f-5f3bc688fd5a"],
        klass: "E — stale duplicate",
        reason:
            "Survivor was created first (2026-08-10 vs 08-11), carries the migrated stable subject key, " +
            "its cohort matches its own creation-time evidence (toddler_2_3_years), and it is the row the " +
            "projection resolves. Loser holds no overrides and no link-group membership, and both share " +
            "wait_since, person and process instance — nothing on the loser is preserved by keeping it.",
    },
    {
        child: "Wrigley Kurzman",
        customer_member_id: "bf7bb266-31b3-4cb3-ad9e-77d94fee4d12",
        survivor: "698f850a-2441-48d5-bed3-0b0870afa848",
        losers: ["0cad23a8-536b-414e-af1e-0f15ef1e3ca0"],
        klass: "A+B aligned — canonical projecting candidate also owns the pin",
        reason:
            "Every signal agrees: survivor was created first, carries the stable subject key, its cohort " +
            "matches its evidence (infant_0_18_months), it is the row the projection resolves, AND it holds " +
            "the active pin (ordinal 1) whose own cohort scope equals the survivor's cohort. Loser has no " +
            "overrides and no link-group membership; wait_since is identical on both.",
    },
];

/** Named so the omission is auditable rather than silent. */
const CONTESTED_DEFERRED = [
    {
        child: "PassA Kid",
        customer_member_id: "1e30034b-54b2-46e5-ba46-079fd087b945",
        candidates: ["94984f6c-f269-4f86-8b1b-9a4607cac2c6", "ee36c3b1-9aba-4923-95d1-31ca5603e34a"],
        klass: "D — conflicting business facts",
        conflict:
            "The pin (ordinal 2, cohort-scoped to infant_0_18_months) is on 94984f6c, which does NOT project; " +
            "ee36c3b1 projects, carries the stable key, and has cohort infant. wait_since differs (08-20 vs 08-21), " +
            "so the survivor decides queue seniority; the cohorts differ, so it also decides section membership; " +
            "and keeping ee36c3b1 means rebinding a cohort-scoped override onto a candidate in another cohort.",
    },
];

async function main() {
    const orgId = (process.env.ORG_ID ?? "").trim();
    if (!orgId) { console.error("ORG_ID required"); process.exit(1); }
    const apply = process.env.APPLY === "1";
    const supabase = createAdminClient();

    const allIds = DECISIONS.flatMap((d) => [d.survivor, ...d.losers]);
    const [{ data: cands }, { data: ovs }, { data: lgs }] = await Promise.all([
        supabase.from("placement_candidates")
            .select("id, customer_member_id, opportunity_id, status, wait_since, program_room_cohort_key")
            .eq("org_id", orgId).in("id", allIds),
        supabase.from("placement_overrides").select("id, placement_candidate_id")
            .eq("org_id", orgId).eq("is_active", true).in("placement_candidate_id", allIds),
        supabase.from("placement_link_group_members").select("id, placement_candidate_id")
            .eq("org_id", orgId).in("placement_candidate_id", allIds),
    ]);

    const byId = new Map(((cands ?? []) as Array<Record<string, unknown>>).map((c) => [String(c.id), c]));
    const activeOvByCand = new Map<string, number>();
    for (const o of (ovs ?? []) as Array<Record<string, unknown>>) {
        const k = String(o.placement_candidate_id);
        activeOvByCand.set(k, (activeOvByCand.get(k) ?? 0) + 1);
    }
    const lgByCand = new Map<string, number>();
    for (const l of (lgs ?? []) as Array<Record<string, unknown>>) {
        const k = String(l.placement_candidate_id);
        lgByCand.set(k, (lgByCand.get(k) ?? 0) + 1);
    }

    const failures: string[] = [];
    for (const d of DECISIONS) {
        for (const id of [d.survivor, ...d.losers]) {
            const c = byId.get(id);
            if (!c) { failures.push(`${d.child}: candidate ${id} NOT FOUND`); continue; }
            if (String(c.status) !== "active") failures.push(`${d.child}: ${id.slice(0, 8)} status=${String(c.status)}, expected active`);
            if (String(c.customer_member_id) !== d.customer_member_id) failures.push(`${d.child}: ${id.slice(0, 8)} member mismatch`);
        }
        // A loser carrying an override or a link-group row must not be retired silently.
        for (const l of d.losers) {
            if ((activeOvByCand.get(l) ?? 0) > 0) failures.push(`${d.child}: loser ${l.slice(0, 8)} has ACTIVE overrides — refusing (rebind decision required)`);
            if ((lgByCand.get(l) ?? 0) > 0) failures.push(`${d.child}: loser ${l.slice(0, 8)} has link-group membership — refusing (rebind decision required)`);
        }
    }

    console.log(`decisions: ${DECISIONS.length} | contested deferred: ${CONTESTED_DEFERRED.length}\n`);
    for (const d of DECISIONS) {
        console.log(`${d.child} [${d.klass}]`);
        console.log(`  survivor ${d.survivor}`);
        console.log(`  retire   ${d.losers.join(", ")}`);
        console.log(`  reason   ${d.reason}\n`);
    }
    for (const c of CONTESTED_DEFERRED) {
        console.log(`DEFERRED — ${c.child} [${c.klass}]\n  ${c.conflict}\n  candidates: ${c.candidates.join(", ")}\n`);
    }

    if (failures.length) {
        console.error(`FAIL CLOSED — ${failures.length} precondition(s). NOTHING written.`);
        failures.forEach((f) => console.error("  " + f));
        process.exit(1);
    }
    console.log("preconditions OK.");
    if (!apply) { console.log("\nDRY RUN — set APPLY=1 to execute."); return; }

    const survivorBySubject = new Map<string, string>(
        DECISIONS.map((d) => [
            placementCandidateSubjectKey({ opportunityId: OPPORTUNITY, customerMemberId: d.customer_member_id }),
            d.survivor,
        ]),
    );
    const out = await retireDuplicateActiveCandidates(supabase, {
        orgId,
        opportunityIds: [OPPORTUNITY],
        survivorBySubject,
    });
    console.log("\nresult:", JSON.stringify(out));
}

void main();
