/**
 * Slice C runtime verification — proves the process_instances read/write cutover works against
 * real staging data. Seeds ONE test lead with two children (customer + customer_members + OCM
 * bridge rows, mirroring what Create Lead produces today), then exercises the REAL runtime functions:
 *   - createEnrollmentProcessInstance  → one process_instance per child
 *   - queryEnrollmentProcessInstanceTrackRows → child-grain Work View reads process_instances
 *   - applyStageOutcomeRuleTarget (move_to_stage) → outcome moves the child's process_instance
 *   - applyStageOutcomeRuleTarget (update_child_enrollment_status) → writes PI state, NOT OCM
 * Cleans up all seeded rows at the end. Does NOT drop OCM, does NOT reset.
 *
 * Usage (from web/):  npx tsx --tsconfig tsconfig.json scripts/verifyProcessInstancesSliceC.ts
 */
import { createClient } from "@supabase/supabase-js";
import { createEnrollmentProcessInstance, listEnrollmentInstancesForLead } from "../lib/process/processInstances";
import { queryEnrollmentProcessInstanceTrackRows } from "../lib/queues/childGrainProcessInstanceQueue";
import { applyStageOutcomeRuleTarget } from "../lib/lifecycle/stageOutcomeRuleTargetExecutor";

// Keep the waitlist placement hook out of this verification (it would create placement_candidates).
process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = "1";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const WORK_UNIT = "5ba90557-876d-4450-9c28-36beac6e83be"; // "New Leads" enrollment work unit
const TAG = "slice_c_verify_20260702";

type Any = Record<string, unknown>;
const ok = (label: string, pass: boolean, detail?: unknown) =>
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? "  :: " + JSON.stringify(detail) : ""}`);

async function nextNumber(supabase: Any, table: string, col: string): Promise<number> {
    const { data } = await (supabase as any).from(table).select(col).order(col, { ascending: false }).limit(1).maybeSingle();
    const n = data ? Number((data as Any)[col]) : 0;
    return (Number.isFinite(n) ? n : 0) + 1 + Math.floor(Math.random() * 1000);
}

async function cleanup(supabase: any, ids: { oppId?: string; cmIds: string[]; customerId?: string }) {
    // Order respects FKs: PI + OCM reference opportunity/customer_member; delete children first.
    await supabase.from("process_instances").delete().eq("org_id", ORG).eq("context_id", ids.oppId ?? "");
    if (ids.oppId) await supabase.from("opportunity_customer_members").delete().eq("org_id", ORG).eq("opportunity_id", ids.oppId);
    if (ids.oppId) await supabase.from("opportunities").delete().eq("org_id", ORG).eq("id", ids.oppId);
    if (ids.cmIds.length) await supabase.from("customer_members").delete().eq("org_id", ORG).in("id", ids.cmIds);
    if (ids.customerId) await supabase.from("customers").delete().eq("org_id", ORG).eq("id", ids.customerId);
}

async function main() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
        console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const ids: { oppId?: string; cmIds: string[]; customerId?: string } = { cmIds: [] };
    try {
        // --- Seed: customer ---
        const custNum = await nextNumber(supabase, "customers", "customer_number");
        const { data: cust, error: custErr } = await supabase
            .from("customers")
            .insert({ org_id: ORG, name: "Slice C Test Family", customer_number: custNum, metadata: { test: TAG } })
            .select("id")
            .single();
        if (custErr) throw new Error("customer insert: " + custErr.message);
        ids.customerId = (cust as Any).id as string;

        // --- Seed: opportunity (the lead / context) ---
        const oppNum = await nextNumber(supabase, "opportunities", "opportunity_number");
        const { data: opp, error: oppErr } = await supabase
            .from("opportunities")
            .insert({
                org_id: ORG,
                opportunity_number: oppNum,
                name: "Slice C Test Lead",
                customer_id: ids.customerId,
                work_unit_id: WORK_UNIT,
                stage_key: "new_lead",
                status_key: "open",
                metadata: { test: TAG },
            })
            .select("id")
            .single();
        if (oppErr) throw new Error("opportunity insert: " + oppErr.message);
        ids.oppId = (opp as Any).id as string;

        // --- Seed: two children (customer_members) + OCM bridge rows (as Create Lead produces today) ---
        const children: { cmId: string; ocmId: string; name: string }[] = [];
        for (const name of ["Ada Test", "Bo Test"]) {
            const { data: cm, error: cmErr } = await supabase
                .from("customer_members")
                .insert({ org_id: ORG, customer_id: ids.customerId, display_name: name, relationship: "child", metadata: { test: TAG } })
                .select("id")
                .single();
            if (cmErr) throw new Error("customer_member insert: " + cmErr.message);
            const cmId = (cm as Any).id as string;
            ids.cmIds.push(cmId);
            const { data: ocm, error: ocmErr } = await supabase
                .from("opportunity_customer_members")
                .insert({ org_id: ORG, opportunity_id: ids.oppId, customer_member_id: cmId, stage_key: "waitlist", metadata: { test: TAG } })
                .select("id")
                .single();
            if (ocmErr) throw new Error("OCM insert: " + ocmErr.message);
            children.push({ cmId, ocmId: (ocm as Any).id as string, name });
        }
        console.log(`\nSeeded lead ${ids.oppId} with children:`, children.map((c) => ({ child: c.cmId, ocm: c.ocmId })));

        // === 1. createEnrollmentProcessInstance per child (the helper Create Lead calls) ===
        for (const c of children) {
            const res = await createEnrollmentProcessInstance(supabase as any, {
                orgId: ORG,
                subjectId: c.cmId,
                contextId: ids.oppId!,
                stageKey: "waitlist",
                state: null,
            });
            if (res.error) throw new Error("createEnrollmentProcessInstance: " + res.error);
        }
        const forLead = await listEnrollmentInstancesForLead(supabase as any, { orgId: ORG, opportunityId: ids.oppId! });
        ok("one process_instance per child (2 children → 2 instances)", forLead.length === 2, { count: forLead.length });
        ok("each instance subject is a distinct child", new Set(forLead.map((r) => r.subject_id)).size === 2);
        ok("all process_key = 'enrollment'", forLead.every((r) => r.process_key === "enrollment"));

        // === 2. child-grain Work View reads process_instances (stage waitlist) ===
        const waitlistRows = await queryEnrollmentProcessInstanceTrackRows({ supabase: supabase as any, orgId: ORG, workUnitId: WORK_UNIT, stageKey: "waitlist" });
        const mine = waitlistRows.filter((r) => r.opportunity_id === ids.oppId);
        ok("Work View (stage=waitlist) reads both children from process_instances", mine.length === 2, { count: mine.length });

        // === 3. move_to_stage moves ONLY child A's process_instance ===
        const [childA, childB] = children;
        const moveRes = await applyStageOutcomeRuleTarget(supabase as any, {
            orgId: ORG,
            userId: "00000000-0000-4000-8000-000000000001",
            departmentId: "slice-c",
            stageKey: "waitlist",
            plan: {} as any,
            subject: { journey_segment: "child", opportunity_id: ids.oppId!, opportunity_customer_member_id: childA.ocmId } as any,
            target: { kind: "move_to_stage", stage_key: "enrolling" } as any,
        });
        ok("move_to_stage returned no error", !moveRes.error, moveRes.error);
        const afterMove = await listEnrollmentInstancesForLead(supabase as any, { orgId: ORG, opportunityId: ids.oppId! });
        const piA = afterMove.find((r) => r.subject_id === childA.cmId);
        const piB = afterMove.find((r) => r.subject_id === childB.cmId);
        ok("child A process_instance moved to 'enrolling'", piA?.stage_key === "enrolling", { a: piA?.stage_key });
        ok("sibling child B process_instance still 'waitlist'", piB?.stage_key === "waitlist", { b: piB?.stage_key });

        // === 4. update_child_enrollment_status writes PI state, NOT OCM.outcome_status_key ===
        const dispRes = await applyStageOutcomeRuleTarget(supabase as any, {
            orgId: ORG,
            userId: "00000000-0000-4000-8000-000000000001",
            departmentId: "slice-c",
            stageKey: "waitlist",
            plan: {} as any,
            subject: { journey_segment: "child", opportunity_id: ids.oppId!, opportunity_customer_member_id: childB.ocmId } as any,
            target: { kind: "update_child_enrollment_status", disposition_key: "waitlisted", close_reason_key: null } as any,
        });
        ok("update_child_enrollment_status returned status_updated", dispRes.status_updated === true, dispRes.error);
        const afterDisp = await listEnrollmentInstancesForLead(supabase as any, { orgId: ORG, opportunityId: ids.oppId! });
        const piBState = afterDisp.find((r) => r.subject_id === childB.cmId)?.state;
        ok("child B process_instance.state = 'waitlisted'", piBState === "waitlisted", { state: piBState });
        // The OCM bridge row's outcome_status_key must remain NULL (we stopped writing it).
        const { data: ocmB } = await supabase.from("opportunity_customer_members").select("outcome_status_key").eq("id", childB.ocmId).maybeSingle();
        ok("OCM.outcome_status_key NOT written (still null)", (ocmB as Any)?.outcome_status_key == null, { ocm_status: (ocmB as Any)?.outcome_status_key });

        // === 5. siblings in different stages → each stage query returns only its own ===
        const wl = (await queryEnrollmentProcessInstanceTrackRows({ supabase: supabase as any, orgId: ORG, workUnitId: WORK_UNIT, stageKey: "waitlist" })).filter((r) => r.opportunity_id === ids.oppId);
        const en = (await queryEnrollmentProcessInstanceTrackRows({ supabase: supabase as any, orgId: ORG, workUnitId: WORK_UNIT, stageKey: "enrolling" })).filter((r) => r.opportunity_id === ids.oppId);
        ok("stage=waitlist returns only child B", wl.length === 1 && wl[0]?.customer_member_id === childB.cmId, { ids: wl.map((r) => r.customer_member_id) });
        ok("stage=enrolling returns only child A", en.length === 1 && en[0]?.customer_member_id === childA.cmId, { ids: en.map((r) => r.customer_member_id) });
    } finally {
        await cleanup(supabase, ids);
        // Verify residue removed.
        const { count: piLeft } = await supabase.from("process_instances").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("context_id", ids.oppId ?? "");
        console.log(`\nCleanup done. process_instances left for test lead: ${piLeft ?? 0}`);
    }
}

main().catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
});
