/**
 * Slice C — child Enrollment movement no longer depends on OCM at runtime. When the outcome subject
 * carries the child identity (customer_member_id), the executor targets process_instances directly:
 *   - no OCM table read to resolve the child
 *   - move_to_stage no longer mirrors stage_key to OCM
 *   - the child lifecycle event is emitted from the process-instance transition
 *   - only the targeted child's instance changes (siblings unaffected)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Event emission uses createAdminClient internally → mock it and assert invocation instead.
vi.mock("@/lib/opportunities/emitChildLifecycleStatusChangedEvent", () => ({
    CHILD_LIFECYCLE_STATUS_CHANGED_EVENT: "child_lifecycle_status_changed",
    emitChildLifecycleStatusChangedEvent: vi.fn(async () => null),
}));
// Placement hook reads OCM bridge data — stub it so these tests isolate the movement write path.
vi.mock("@/lib/orchestration/placement/placementCandidateLifecycleHook", () => ({
    isPlacementLifecycleCandidateHookEnabled: () => false,
    ensurePlacementCandidateForWaitlistedChild: vi.fn(async () => ({ attempted: false, created: false })),
}));

import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import { emitChildLifecycleStatusChangedEvent } from "@/lib/opportunities/emitChildLifecycleStatusChangedEvent";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const emitMock = vi.mocked(emitChildLifecycleStatusChangedEvent);

type PiRow = { id: string; org_id: string; process_key: string; context_id: string; subject_id: string; stage_key: string | null; state: string | null; close_reason_key: string | null };

/** Mock Supabase that counts every access to the OCM table (to prove the child path never touches it). */
function makeSupabase(process_instances: PiRow[]) {
    let ocmAccess = 0;
    let ocmWrites = 0;
    const client = {
        from(table: string) {
            if (table === "opportunity_customer_members") ocmAccess++;
            let op: "select" | "update" = "select";
            let patch: Record<string, unknown> | null = null;
            const filters: Record<string, unknown> = {};
            const rowsFor = () =>
                (table === "process_instances" ? process_instances : []).filter((r) =>
                    Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
                );
            const apply = (rows: Record<string, unknown>[]) => {
                if (op === "update" && patch) for (const r of rows) Object.assign(r, patch);
            };
            const builder: Record<string, unknown> = {
                select: () => builder,
                update(p: Record<string, unknown>) {
                    op = "update";
                    patch = p;
                    if (table === "opportunity_customer_members") ocmWrites++;
                    return builder;
                },
                eq(c: string, v: unknown) {
                    filters[c] = v;
                    return builder;
                },
                maybeSingle() {
                    const rows = rowsFor();
                    apply(rows);
                    return Promise.resolve({ data: rows[0] ?? null, error: null });
                },
                then(resolve: (r: { data: Record<string, unknown>[]; error: null }) => void) {
                    const rows = rowsFor();
                    apply(rows);
                    resolve({ data: rows.map((r) => ({ ...r })), error: null });
                },
            };
            return builder;
        },
    };
    return { client: client as never, stats: () => ({ ocmAccess, ocmWrites }) };
}

const pi = (id: string, subjectId: string, stageKey: string, state: string | null): PiRow => ({
    id,
    org_id: ORG,
    process_key: "enrollment",
    context_id: LEAD,
    subject_id: subjectId,
    stage_key: stageKey,
    state,
    close_reason_key: null,
});
const base = (extra: Record<string, unknown>) => ({
    orgId: ORG,
    userId: "00000000-0000-4000-8000-000000000001",
    departmentId: "slice-c",
    stageKey: "waitlist",
    plan: {} as never,
    ...extra,
});

describe("Slice C — child movement targets process_instances without OCM", () => {
    beforeEach(() => emitMock.mockClear());

    it("update_child_enrollment_status resolves the child from the subject — no OCM read", async () => {
        const rows = [pi("pi-A", "child-A", "enrolling", null), pi("pi-B", "child-B", "enrolling", null)];
        const { client, stats } = makeSupabase(rows);
        const res = await applyStageOutcomeRuleTarget(client, base({
            subject: { journey_segment: "child", opportunity_id: LEAD, customer_member_id: "child-A" } as never,
            target: { kind: "update_child_enrollment_status", disposition_key: "enrolled" } as never,
        }) as never);
        expect(res.status_updated).toBe(true);
        expect(rows.find((r) => r.id === "pi-A")?.state).toBe("enrolled");
        expect(stats().ocmAccess).toBe(0); // never touched OCM
    });

    it("move_to_stage moves the child's process_instance and does NOT write OCM.stage_key", async () => {
        const rows = [pi("pi-A", "child-A", "waitlist", null), pi("pi-B", "child-B", "waitlist", null)];
        const { client, stats } = makeSupabase(rows);
        const res = await applyStageOutcomeRuleTarget(client, base({
            subject: { journey_segment: "child", opportunity_id: LEAD, customer_member_id: "child-A" } as never,
            target: { kind: "move_to_stage", stage_key: "enrolling" } as never,
        }) as never);
        expect(res.error).toBeUndefined();
        expect(rows.find((r) => r.id === "pi-A")?.stage_key).toBe("enrolling");
        expect(rows.find((r) => r.id === "pi-B")?.stage_key).toBe("waitlist"); // sibling unaffected
        expect(stats().ocmAccess).toBe(0);
        expect(stats().ocmWrites).toBe(0); // no OCM stage mirror
    });

    it("emits child lifecycle event on the process-instance transition", async () => {
        const rows = [pi("pi-A", "child-A", "waitlist", null)];
        const { client } = makeSupabase(rows);
        await applyStageOutcomeRuleTarget(client, base({
            subject: {
                journey_segment: "child",
                opportunity_id: LEAD,
                customer_member_id: "child-A",
                opportunity_customer_member_id: "ocm-A",
            } as never,
            target: { kind: "update_child_enrollment_status", disposition_key: "waitlisted" } as never,
        }) as never);
        expect(emitMock).toHaveBeenCalledTimes(1);
        expect(emitMock.mock.calls[0][0]).toMatchObject({
            opportunityId: LEAD,
            opportunityCustomerMemberId: "ocm-A",
            previousStatusKey: null,
            nextStatusKey: "waitlisted",
        });
    });

    it("does NOT emit an event when state is unchanged (previous === next)", async () => {
        const rows = [pi("pi-A", "child-A", "waitlist", "waitlisted")]; // already waitlisted
        const { client } = makeSupabase(rows);
        await applyStageOutcomeRuleTarget(client, base({
            subject: {
                journey_segment: "child",
                opportunity_id: LEAD,
                customer_member_id: "child-A",
                opportunity_customer_member_id: "ocm-A",
            } as never,
            target: { kind: "update_child_enrollment_status", disposition_key: "waitlisted" } as never,
        }) as never);
        expect(emitMock).not.toHaveBeenCalled();
    });

    it("disposition on one child leaves the sibling's process_instance untouched", async () => {
        const rows = [pi("pi-A", "child-A", "enrolling", null), pi("pi-B", "child-B", "enrolling", null)];
        const { client } = makeSupabase(rows);
        await applyStageOutcomeRuleTarget(client, base({
            subject: { journey_segment: "child", opportunity_id: LEAD, customer_member_id: "child-B" } as never,
            target: { kind: "update_child_enrollment_status", disposition_key: "withdrawn", close_reason_key: "family_moved" } as never,
        }) as never);
        expect(rows.find((r) => r.id === "pi-B")?.state).toBe("withdrawn");
        expect(rows.find((r) => r.id === "pi-B")?.close_reason_key).toBe("family_moved");
        expect(rows.find((r) => r.id === "pi-A")?.state).toBeNull(); // sibling untouched
    });
});
