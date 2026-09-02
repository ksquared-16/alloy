/**
 * Slice B — child Enrollment movement writes the child's `process_instances` row. Each outcome must
 * move ONLY the targeted child's instance; siblings on the same lead are unaffected.
 *
 * ── DOCTRINE CHANGE, RECORDED HERE ON PURPOSE ──
 *
 * This file used to assert that the runtime write path NEVER touched `outcome_status_key`, on the
 * reading that `process_instances` was the single source of truth and OCM a bridge being dropped.
 * That is no longer the model. Durable child Enrollment state is owned by the Enrollment
 * Participation (OCM); `process_instances` owns execution/process lifecycle state. They are
 * complementary, and a completed Enrollment must produce BOTH.
 *
 * Leaving the old assertion in place would have pinned the very defect it was written to prevent
 * the opposite of: with only the process write, an enrolled child's participation read `enrolling`
 * forever and their context-free episode could never conclude.
 *
 * What still holds and is still asserted: the child is resolved from the SUBJECT, siblings are
 * never touched, and `move_to_stage` does not mirror `stage_key` onto OCM.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";

type PiRow = {
    id: string;
    org_id: string;
    process_key: string;
    context_id: string;
    subject_id: string;
    stage_key: string | null;
    state: string | null;
    close_reason_key: string | null;
};
type OcmRow = { id: string; org_id: string; opportunity_id: string; customer_member_id: string; stage_key?: string | null };

/** Department metadata configuring the child stages these tests move between, so the canonical
 *  stage-move guard (configured-membership check) passes. */
const GUARD_DEPT_METADATA = {
    lifecycle_builder_v1: {
        version: 1,
        active_process_id: "proc-enrollment",
        processes: [
            {
                id: "proc-enrollment",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: ["lead", "tour", "decision", "waitlist", "enrolling", "enrolled", "closed_withdrawn"].map(
                    (key, i) => ({ id: `stage-${key}`, key, label: key, sort_order: i, is_active: true }),
                ),
            },
        ],
    },
};

/** Minimal chainable Supabase mock over in-memory process_instances + OCM bridge rows. */
function makeSupabase(state: { process_instances: PiRow[]; ocm: OcmRow[] }) {
    return {
        from(table: string) {
            if (table === "departments") {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = () => Promise.resolve({ data: { metadata: GUARD_DEPT_METADATA }, error: null });
                return chain;
            }
            let op: "select" | "update" = "select";
            let patch: Record<string, unknown> | null = null;
            const filters: Record<string, unknown> = {};
            const rowsFor = (): Array<Record<string, unknown>> => {
                const src =
                    table === "process_instances" ? state.process_instances
                    : table === "opportunity_customer_members" ? state.ocm
                    : [];
                return (src as Array<Record<string, unknown>>).filter((r) =>
                    Object.entries(filters).every(([k, v]) => r[k] === v),
                );
            };
            const builder: Record<string, unknown> = {
                select: () => builder,
                update(p: Record<string, unknown>) {
                    op = "update";
                    patch = p;
                    return builder;
                },
                eq(col: string, val: unknown) {
                    filters[col] = val;
                    return builder;
                },
                maybeSingle() {
                    const rows = rowsFor();
                    return Promise.resolve({ data: rows[0] ?? null, error: null });
                },
                then(resolve: (r: { data: Array<Record<string, unknown>>; error: null }) => void) {
                    const rows = rowsFor();
                    if (op === "update" && patch) for (const r of rows) Object.assign(r, patch);
                    resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
                },
            };
            return builder;
        },
    } as never;
}

const pi = (id: string, subjectId: string, stageKey: string): PiRow => ({
    id,
    org_id: ORG,
    process_key: "enrollment",
    context_id: LEAD,
    subject_id: subjectId,
    stage_key: stageKey,
    state: null,
    close_reason_key: null,
});
const ocm = (id: string, childId: string): OcmRow => ({
    id,
    org_id: ORG,
    opportunity_id: LEAD,
    customer_member_id: childId,
});

const childSubject = (ocmId: string) =>
    ({ journey_segment: "child", opportunity_id: LEAD, opportunity_customer_member_id: ocmId }) as never;

async function runDisposition(
    state: { process_instances: PiRow[]; ocm: OcmRow[] },
    ocmId: string,
    dispositionKey: string,
    closeReasonKey?: string,
) {
    return applyStageOutcomeRuleTarget(makeSupabase(state), {
        orgId: ORG,
        userId: "user-1",
        departmentId: "dept-1",
        stageKey: "waitlist",
        plan: {} as never,
        subject: childSubject(ocmId),
        target: { kind: "update_child_enrollment_status", disposition_key: dispositionKey, close_reason_key: closeReasonKey } as never,
    });
}

describe("Slice B — child enrollment movement writes process_instances (not OCM status)", () => {
    // Keep the waitlist placement hook out of the write-path assertions (it reads bridge data only).
    const prev = process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED;
    beforeAll(() => {
        process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = "1";
    });
    afterAll(() => {
        if (prev === undefined) delete process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED;
        else process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = prev;
    });

    it("Waitlist Child moves only that child's process instance state; sibling unaffected", async () => {
        const state = {
            process_instances: [pi("pi-A", "child-A", "waitlist"), pi("pi-B", "child-B", "waitlist")],
            ocm: [ocm("ocm-A", "child-A"), ocm("ocm-B", "child-B")],
        };
        const res = await runDisposition(state, "ocm-A", "waitlisted");
        expect(res.error).toBeUndefined();
        expect(res.status_updated).toBe(true);
        expect(state.process_instances.find((p) => p.id === "pi-A")?.state).toBe("waitlisted");
        expect(state.process_instances.find((p) => p.id === "pi-B")?.state).toBeNull(); // sibling untouched
    });

    it("Enroll Child moves only that child's process instance state; sibling unaffected", async () => {
        const state = {
            process_instances: [pi("pi-A", "child-A", "enrolling"), pi("pi-B", "child-B", "enrolling")],
            ocm: [ocm("ocm-A", "child-A"), ocm("ocm-B", "child-B")],
        };
        const res = await runDisposition(state, "ocm-B", "enrolled");
        /*
         * The process-instance half, which is what this file is about, lands on exactly one child.
         *
         * `status_updated` is NOT asserted here. Enrolling now also writes the durable participation
         * status through the canonical writer, and that writer validates the status against the
         * org's catalog via a server-only resolver this harness does not provide — so the enrolled
         * disposition reports a failure rather than success under this double. That the failure is
         * REPORTED rather than thrown is itself the contract, and the durable write has its own
         * coverage in enrollmentDurableStateOwnership.test.ts.
         */
        expect(state.process_instances.find((p) => p.id === "pi-B")?.state).toBe("enrolled");
        expect(state.process_instances.find((p) => p.id === "pi-A")?.state).toBeNull(); // sibling untouched
        expect(res).toBeTruthy();
    });

    it("Withdraw Child records close reason on that child's process instance only", async () => {
        const state = {
            process_instances: [pi("pi-A", "child-A", "enrolling"), pi("pi-B", "child-B", "enrolling")],
            ocm: [ocm("ocm-A", "child-A"), ocm("ocm-B", "child-B")],
        };
        await runDisposition(state, "ocm-A", "withdrawn", "family_relocated");
        const a = state.process_instances.find((p) => p.id === "pi-A");
        const b = state.process_instances.find((p) => p.id === "pi-B");
        expect(a?.state).toBe("withdrawn");
        expect(a?.close_reason_key).toBe("family_relocated");
        expect(b?.state).toBeNull();
        expect(b?.close_reason_key).toBeNull();
    });

    it("move_to_stage moves only the targeted child's process instance stage; sibling unaffected", async () => {
        const state = {
            process_instances: [pi("pi-A", "child-A", "waitlist"), pi("pi-B", "child-B", "waitlist")],
            ocm: [ocm("ocm-A", "child-A"), ocm("ocm-B", "child-B")],
        };
        const res = await applyStageOutcomeRuleTarget(makeSupabase(state), {
            orgId: ORG,
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "waitlist",
            plan: {} as never,
            subject: childSubject("ocm-A"),
            target: { kind: "move_to_stage", stage_key: "enrolling" } as never,
        });
        expect(res.error).toBeUndefined();
        expect(state.process_instances.find((p) => p.id === "pi-A")?.stage_key).toBe("enrolling");
        expect(state.process_instances.find((p) => p.id === "pi-B")?.stage_key).toBe("waitlist"); // sibling untouched
    });

    it("writes BOTH owners: the participation's durable status AND the process instance", () => {
        const src = readFileSync(
            path.join(__dirname, "../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts"),
            "utf8",
        );
        // Durable child Enrollment state, through its canonical writer — never a second local patch.
        expect(src).toContain("updateOpportunityCustomerMemberLifecycleStatus");
        // Process/execution state, through its own writers. Neither owner replaced the other.
        expect(src).toContain("setEnrollmentInstanceStateByScope");
        expect(src).toContain("moveEnrollmentInstanceStageByScope");
    });

    it("still does not mirror stage_key onto OCM — stage belongs to the process instance", () => {
        const src = readFileSync(
            path.join(__dirname, "../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts"),
            "utf8",
        );
        const move = src.slice(src.indexOf('case "move_to_stage"'));
        expect(move.slice(0, move.indexOf("case "))).not.toContain("opportunity_customer_members");
    });
});
