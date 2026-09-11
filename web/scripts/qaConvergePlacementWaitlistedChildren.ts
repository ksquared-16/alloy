#!/usr/bin/env npx tsx
/**
 * QA-only: converge children who are PLACEMENT-waitlisted onto real child Waitlist membership.
 *
 * ── WHAT THIS EXISTS TO REPAIR ──
 *
 * Placement waitlisting and Enrollment child Waitlist are one operational decision, but the manual
 * "Change Enrollment Status" path recorded only half of it: disposition `waitlisted` plus a
 * placement candidate, while the child's process instance -- the only record that owns its stage --
 * stayed where it was. That path is fixed at the mutation now, so newly waitlisted children are
 * correct as they are created. This script is for the ones created BEFORE the fix.
 *
 * ── IT WRITES NOTHING OF ITS OWN ──
 *
 * Every convergence goes through `applyChildWaitlistViaOutcomeRuntime`, the same canonical typed
 * path the `waitlist_child` command uses: `update_child_enrollment_status` then `move_to_stage`,
 * both executed by the outcome runtime, with the stage reaching `process_instances` only through
 * `moveEnrollmentInstanceStageByScope`. There is no ad-hoc SQL lifecycle write here, and adding one
 * would defeat the point -- the destination-stage work reconciliation that opens
 * `review_waitlist_position` hangs off that runtime, not off the row.
 *
 * ── IDEMPOTENT ──
 *
 * A child already at `waitlist` is skipped before any write (`already_converged`). Should one be
 * converged twice anyway, the runtime writes the disposition it already holds and moves it to the
 * stage it already occupies, and the work reconciler treats matching open work at the destination as
 * satisfied rather than opening a second copy. Re-running is expected, not exceptional.
 *
 * ── THE QUEUE IS NOT THE WRITER ──
 *
 * Candidates are selected from placement facts and the child's own disposition -- never from
 * "this row appeared in the Waitlist lane". Lane membership is a projection of the stage this script
 * is trying to establish, so reading it would make the repair circular.
 *
 * Env:
 *   ORG_ID=<uuid>                     (required)
 *   OPPORTUNITY_IDS=id1,id2           (optional — narrow to specific families)
 *   ACTOR_USER_ID=<uuid>              (optional — attributed actor for the transition)
 *   DRY_RUN=1                         (default — report only)
 *   QA_CONVERGE_APPLY=1               (required, with DRY_RUN=0, to mutate)
 *
 * Run from `web/`:
 *   ORG_ID=... npm run dev:qa:converge-placement-waitlisted
 *   ORG_ID=... QA_CONVERGE_APPLY=1 DRY_RUN=0 npm run dev:qa:converge-placement-waitlisted
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    applyChildWaitlistViaOutcomeRuntime,
    CHILD_WAITLIST_DISPOSITION_KEY,
    CHILD_WAITLIST_STAGE_KEY,
} from "@/lib/lifecycle/applyChildWaitlistViaOutcomeRuntime";
import { readEnrollmentInstanceStageKey } from "@/lib/process/processInstances";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type Subject = {
    opportunity_id: string;
    customer_member_id: string;
    opportunity_customer_member_id: string;
    /** Why this child is considered placement-waitlisted. Reported so the selection is auditable. */
    evidence: string[];
};

type Outcome =
    | { subject: Subject; result: "already_converged"; stage_key: string }
    | { subject: Subject; result: "would_converge"; stage_key: string | null }
    | { subject: Subject; result: "converged"; from_stage_key: string | null; degraded?: string }
    | { subject: Subject; result: "failed"; error: string };

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function parseIds(): string[] {
    const fromEnv = (process.env.OPPORTUNITY_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const fromArgs = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
    return [...new Set([...fromEnv, ...fromArgs])];
}

/**
 * The children that placement considers waitlisted.
 *
 * Two independent facts, unioned because either one on its own is a real half-recorded state: the
 * child's own disposition, and a live placement candidate. Restricting to candidates that are not
 * `withdrawn`/`placed` keeps the repair to children who are genuinely still waiting.
 *
 * Paged explicitly: PostgREST caps a request at 1000 rows whatever limit is asked for, and a silent
 * truncation here would look exactly like "there were no more to fix".
 */
async function loadPlacementWaitlistedSubjects(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    opportunityIds: string[],
): Promise<Subject[]> {
    const byKey = new Map<string, Subject>();
    const add = (
        opportunityId: string | null,
        customerMemberId: string | null,
        ocmId: string | null,
        evidence: string,
    ) => {
        if (!opportunityId || !customerMemberId || !ocmId) return;
        const key = `${opportunityId}:${customerMemberId}`;
        const existing = byKey.get(key);
        if (existing) {
            if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
            return;
        }
        byKey.set(key, {
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
            opportunity_customer_member_id: ocmId,
            evidence: [evidence],
        });
    };

    const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
        let q = supabase
            .from("opportunity_customer_members")
            .select("id, opportunity_id, customer_member_id, outcome_status_key")
            .eq("org_id", orgId)
            .eq("outcome_status_key", CHILD_WAITLIST_DISPOSITION_KEY)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (opportunityIds.length) q = q.in("opportunity_id", opportunityIds);
        const { data, error } = await q;
        if (error) throw new Error(`ocm load failed: ${error.message}`);
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        for (const r of rows) {
            add(
                trimOrNull(r.opportunity_id),
                trimOrNull(r.customer_member_id),
                trimOrNull(r.id),
                "disposition=waitlisted",
            );
        }
        if (rows.length < PAGE) break;
    }

    for (let from = 0; ; from += PAGE) {
        let q = supabase
            .from("placement_candidates")
            .select("id, opportunity_id, customer_member_id, opportunity_customer_member_id, status")
            .eq("org_id", orgId)
            .in("status", ["active", "paused"])
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (opportunityIds.length) q = q.in("opportunity_id", opportunityIds);
        const { data, error } = await q;
        if (error) throw new Error(`placement_candidates load failed: ${error.message}`);
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        for (const r of rows) {
            add(
                trimOrNull(r.opportunity_id),
                trimOrNull(r.customer_member_id),
                trimOrNull(r.opportunity_customer_member_id),
                `placement_candidate:${trimOrNull(r.status) ?? "unknown"}`,
            );
        }
        if (rows.length < PAGE) break;
    }

    return [...byKey.values()];
}

async function main() {
    const orgId = trimOrNull(process.env.ORG_ID);
    if (!orgId) {
        console.error("ORG_ID is required.");
        process.exit(1);
    }
    const apply = process.env.QA_CONVERGE_APPLY === "1" && process.env.DRY_RUN === "0";
    const actorUserId = trimOrNull(process.env.ACTOR_USER_ID) ?? "00000000-0000-0000-0000-000000000000";
    const opportunityIds = parseIds();
    const supabase = createAdminClient();

    const subjects = await loadPlacementWaitlistedSubjects(supabase, orgId, opportunityIds);
    console.log(
        `[converge-placement-waitlisted] org=${orgId} subjects=${subjects.length} mode=${apply ? "APPLY" : "DRY_RUN"}`,
    );

    const outcomes: Outcome[] = [];
    const departmentByOpportunity = new Map<string, string | null>();

    for (const subject of subjects) {
        // The child's OWN stage — the authority, read where it lives.
        const stageKey = await readEnrollmentInstanceStageKey(supabase, {
            orgId,
            opportunityId: subject.opportunity_id,
            customerMemberId: subject.customer_member_id,
        });

        if (stageKey === CHILD_WAITLIST_STAGE_KEY) {
            outcomes.push({ subject, result: "already_converged", stage_key: stageKey });
            continue;
        }

        if (!apply) {
            outcomes.push({ subject, result: "would_converge", stage_key: stageKey });
            continue;
        }

        if (!departmentByOpportunity.has(subject.opportunity_id)) {
            departmentByOpportunity.set(
                subject.opportunity_id,
                await resolveEnrollmentDepartmentForOpportunity({
                    supabase,
                    orgId,
                    opportunityId: subject.opportunity_id,
                }),
            );
        }
        const departmentId = departmentByOpportunity.get(subject.opportunity_id) ?? null;
        if (!departmentId) {
            outcomes.push({ subject, result: "failed", error: "no_enrollment_department" });
            continue;
        }

        const progression = await applyChildWaitlistViaOutcomeRuntime({
            supabase,
            orgId,
            userId: actorUserId,
            departmentId,
            opportunityId: subject.opportunity_id,
            customerMemberId: subject.customer_member_id,
            opportunityCustomerMemberId: subject.opportunity_customer_member_id,
            // The stage the child is leaving, so the runtime reconciles work across the real move.
            sourceStageKey: stageKey,
        });

        outcomes.push(
            progression.ok ?
                {
                    subject,
                    result: "converged",
                    from_stage_key: stageKey,
                    ...(progression.degraded ? { degraded: progression.degraded } : {}),
                }
            :   { subject, result: "failed", error: progression.error },
        );
    }

    const tally = outcomes.reduce<Record<string, number>>((acc, o) => {
        acc[o.result] = (acc[o.result] ?? 0) + 1;
        return acc;
    }, {});

    for (const o of outcomes) {
        const who = `${o.subject.opportunity_id}/${o.subject.customer_member_id}`;
        if (o.result === "already_converged") console.log(`  ok       ${who} already at ${o.stage_key}`);
        else if (o.result === "would_converge") console.log(`  would    ${who} ${o.stage_key ?? "(no stage)"} → ${CHILD_WAITLIST_STAGE_KEY}  [${o.subject.evidence.join(", ")}]`);
        else if (o.result === "converged") console.log(`  moved    ${who} ${o.from_stage_key ?? "(no stage)"} → ${CHILD_WAITLIST_STAGE_KEY}${o.degraded ? `  degraded: ${o.degraded}` : ""}`);
        else console.error(`  FAILED   ${who} ${o.error}`);
    }

    console.log(`[converge-placement-waitlisted] ${JSON.stringify(tally)}`);
    if (!apply) {
        console.log("[converge-placement-waitlisted] DRY RUN — set QA_CONVERGE_APPLY=1 DRY_RUN=0 to apply.");
    }
    // A failure is a real result worth a non-zero exit, so a caller cannot mistake it for success.
    process.exit(outcomes.some((o) => o.result === "failed") ? 1 : 0);
}

main().catch((e) => {
    console.error("[converge-placement-waitlisted] fatal", e);
    process.exit(1);
});
