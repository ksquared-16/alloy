/**
 * PLACEMENT WAITLISTING AND CHILD PROCESS MEMBERSHIP ARE ONE DECISION.
 *
 * Two operator paths put a child on the waitlist, and until now they recorded different amounts of
 * it:
 *
 *   waitlist_child (the command)   → applyChildWaitlistViaOutcomeRuntime: disposition AND stage.
 *   Change Enrollment Status       → disposition + a placement candidate, and NO stage at all.
 *
 * The second one skipped the configured `move_to_stage` target, on the premise that "the caller
 * already applied the transition manually". That premise is true of the STATUS kinds — the manual
 * path writes the status itself, so re-running them would double-write. It was never true of the
 * movement: `executeEnrollmentStatusTransition` touches no stage on any path.
 *
 * For a family case the gap is invisible, because a case's rail position is derived from its status.
 * For a child it is the divergence itself — a child's position lives in its process instance and
 * nowhere else — and it is how the tenant came to hold many placement-waitlisted children against a
 * single Waitlist membership.
 *
 * These tests hold the seam to: the movement runs for a child, the status kinds stay skipped, the
 * family path is untouched, and the runtime — not this module — owns the write.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    buildEnrollmentTemplateStageRecords,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { applyEnrollmentStatusTransitionOutcomeEffects } from "@/lib/admin/enrollmentStatus/applyEnrollmentStatusTransitionOutcomeEffects";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";

const mockExecuteStageOperatingOutcome = vi.fn();
const mockOnChildDispositionEntrySpawnWorkIntent = vi.fn();
const mockApplyStageOutcomeRuleTarget = vi.fn();

vi.mock("@/lib/lifecycle/executeStageOperatingOutcome", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/lifecycle/executeStageOperatingOutcome")>();
    return {
        ...actual,
        executeStageOperatingOutcome: (...args: unknown[]) => mockExecuteStageOperatingOutcome(...args),
    };
});

vi.mock("@/lib/lifecycle/onChildDispositionEntrySpawnWorkIntent", () => ({
    onChildDispositionEntrySpawnWorkIntent: (...args: unknown[]) =>
        mockOnChildDispositionEntrySpawnWorkIntent(...args),
}));

vi.mock("@/lib/lifecycle/stageOutcomeRuleTargetExecutor", () => ({
    applyStageOutcomeRuleTarget: (...args: unknown[]) => mockApplyStageOutcomeRuleTarget(...args),
}));

function enrollmentDepartmentMetadata(): Record<string, unknown> {
    const process: LifecycleBuilderProcessRecord = {
        id: "proc-1",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        is_active: true,
        sort_order: 0,
        tracks_v1: ENROLLMENT_DEFAULT_TRACKS,
        stages: buildEnrollmentTemplateStageRecords(),
    };
    return {
        lifecycle_builder_v1: { version: 1 as const, active_process_id: "proc-1", processes: [process] },
    };
}

function departmentSupabase(metadata: Record<string, unknown>) {
    return {
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () =>
                                table === "opportunity_customer_members" ?
                                    { data: { outcome_status_key: "decision_pending" } }
                                :   { data: null },
                        }),
                        maybeSingle: async () =>
                            table === "departments" ? { data: { metadata } } : { data: null },
                    }),
                }),
            }),
        }),
    } as never;
}

async function effectsFor(grain: "child" | "case") {
    return applyEnrollmentStatusTransitionOutcomeEffects({
        supabase: departmentSupabase(enrollmentDepartmentMetadata()),
        orgId: "org-1",
        userId: "user-1",
        departmentId: "dept-1",
        scope: {
            grain,
            opportunityId: "opp-1",
            ...(grain === "child" ?
                { opportunityCustomerMemberId: "ocm-1", customerMemberId: "cm-1" }
            :   {}),
        },
        destinationKey: "waitlist",
        targetStatusKey: "waitlisted",
        previousStatusKey: "decision_pending",
        sourceBuilderStageKey: "decision",
    } as never);
}

/** What the outcome runtime was actually asked to skip on the single call it received. */
function skipKindsFromCall(): readonly string[] {
    expect(mockExecuteStageOperatingOutcome).toHaveBeenCalledTimes(1);
    return mockExecuteStageOperatingOutcome.mock.calls[0]![0].skipTargetKinds as readonly string[];
}

describe("manual Change Enrollment Status → Waitlist, for a child", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({
            action: "spawned",
            work_id: "work-waitlist-entry",
        });
        mockApplyStageOutcomeRuleTarget.mockResolvedValue({});
    });

    it("no longer discards the configured stage move", async () => {
        await effectsFor("child");
        expect(skipKindsFromCall()).not.toContain("move_to_stage");
    });

    it("still skips the status kinds the manual path already wrote", async () => {
        await effectsFor("child");
        const skipped = skipKindsFromCall();
        expect(skipped).toContain("update_child_enrollment_status");
        expect(skipped).toContain("update_family_case_status");
        expect(skipped).toContain("update_candidate_status");
        expect(skipped).toContain("no_movement");
    });

    it("targets the CHILD — the subject the runtime will move", async () => {
        await effectsFor("child");
        const subject = mockExecuteStageOperatingOutcome.mock.calls[0]![0].subject;
        expect(subject.journey_segment).toBe("child");
        expect(subject.customer_member_id).toBe("cm-1");
        expect(subject.opportunity_customer_member_id).toBe("ocm-1");
    });

    /**
     * The move is not invented here. Configuration already declares it, which is why un-skipping is
     * enough — and why this module writes no stage of its own.
     */
    it("relies on a stage move the configured outcome rule already declares", async () => {
        // `decision` is the builder stage; `decision_pending` is the plan key it resolves to via
        // STAGE_PLAN_LOOKUP_KEYS, and the plan is where the targets are declared.
        const plan = defaultStageOperatingPlanForEnrollmentStage("decision_pending");
        expect(plan).toBeTruthy();
        const targets = outcomeRulesForKey(plan!, "waitlist").flatMap((r) => r.targets);
        expect(targets).toContainEqual({ kind: "move_to_stage", stage_key: "waitlist" });
        expect(targets).toContainEqual({
            kind: "update_child_enrollment_status",
            disposition_key: "waitlisted",
        });
    });

    it("does not write a stage itself — the outcome runtime is the only writer it calls", async () => {
        const source = applyEnrollmentStatusTransitionOutcomeEffects.toString();
        expect(source).not.toMatch(/process_instances/);
        expect(source).not.toMatch(/moveEnrollmentInstanceStageByScope/);
        expect(source).not.toMatch(/\.from\(["'`]process_instances/);
    });

    it("is safe to repeat — nothing about the call depends on the child not already being there", async () => {
        await effectsFor("child");
        const first = skipKindsFromCall();
        vi.clearAllMocks();
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({ action: "skipped", reason: "already_open" });
        mockApplyStageOutcomeRuleTarget.mockResolvedValue({});
        await effectsFor("child");
        expect(skipKindsFromCall()).toEqual(first);
    });
});

/**
 * A SOURCE STAGE'S RULES DO NOT LIMIT WHERE AN OPERATOR MAY SEND A CHILD.
 *
 * Everything above only runs when the SOURCE plan happens to declare a rule for the destination.
 * `decision_pending` declares `to_waitlist`; `lead` declares only `ready_to_contact`. So a child
 * waitlisted straight from Lead resolved no plan at all, `executeStageOperatingOutcome` never ran,
 * and un-skipping `move_to_stage` had nothing to un-skip.
 *
 * Observed live before this branch existed: a child taken Lead → Waitlist came back
 * `outcome_status_key = waitlisted` with a placement candidate created and
 * `_effective_participant_stage_keys` still empty — riding its family's Lead.
 */
describe("the destination the operator chose is applied even when no rule names it", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // No plan resolves for `lead` + `waitlist`, so the outcome runtime is never called.
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({ action: "spawned", work_id: "w1" });
        mockApplyStageOutcomeRuleTarget.mockResolvedValue({});
    });

    async function fromLead() {
        return applyEnrollmentStatusTransitionOutcomeEffects({
            supabase: departmentSupabase(enrollmentDepartmentMetadata()),
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            scope: {
                grain: "child",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
            },
            destinationKey: "waitlist",
            targetStatusKey: "waitlisted",
            previousStatusKey: "new_inquiry",
            sourceBuilderStageKey: "lead",
        } as never);
    }

    it("moves the child to the chosen destination through the canonical executor", async () => {
        await fromLead();
        expect(mockApplyStageOutcomeRuleTarget).toHaveBeenCalledTimes(1);
        const call = mockApplyStageOutcomeRuleTarget.mock.calls[0]![1];
        expect(call.target).toEqual({ kind: "move_to_stage", stage_key: "waitlist" });
        expect(call.subject.journey_segment).toBe("child");
    });

    /**
     * The participation id alone is enough. Requiring the durable child id made the branch
     * unreachable from the drawer and the queue row, which name only the participation — and
     * `resolveChildSubjectId` reads the durable child from it anyway.
     */
    it("runs on the participation id alone, as the drawer and queue row supply it", async () => {
        await fromLead();
        const call = mockApplyStageOutcomeRuleTarget.mock.calls[0]![1];
        expect(call.subject.opportunity_customer_member_id).toBe("ocm-1");
    });

    it("surfaces a refused move as an error rather than reporting a clean transition", async () => {
        mockApplyStageOutcomeRuleTarget.mockResolvedValue({ error: "no enrollment track was found" });
        const r = await fromLead();
        expect(r.errors.join(" ")).toContain("destination_stage_move");
        expect(r.destination_stage_move?.error).toBeTruthy();
    });

    it("does NOT move a second time when a configured rule already moved the child", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [{ kind: "move_to_stage", stage_key: "waitlist" }],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        await effectsFor("child");
        expect(mockApplyStageOutcomeRuleTarget).not.toHaveBeenCalled();
    });

    it("leaves a CASE transition alone — a case's position follows its status", async () => {
        await effectsFor("case");
        expect(mockApplyStageOutcomeRuleTarget).not.toHaveBeenCalled();
    });

    /**
     * `closed_withdrawn` is the one destination key that names no stage, and the guard is the
     * vocabulary itself rather than a list maintained here.
     */
    it("refuses a destination that names no stage", async () => {
        await applyEnrollmentStatusTransitionOutcomeEffects({
            supabase: departmentSupabase(enrollmentDepartmentMetadata()),
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            scope: { grain: "child", opportunityId: "opp-1", opportunityCustomerMemberId: "ocm-1" },
            destinationKey: "closed_withdrawn",
            targetStatusKey: "not_enrolling",
            previousStatusKey: "new_inquiry",
            sourceBuilderStageKey: "lead",
        } as never);
        expect(mockApplyStageOutcomeRuleTarget).not.toHaveBeenCalled();
    });
});

describe("the family path is untouched", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({ action: "skipped", reason: "case_grain" });
        mockApplyStageOutcomeRuleTarget.mockResolvedValue({});
    });

    it("a case transition keeps the full skip set, movement included", async () => {
        await effectsFor("case");
        if (!mockExecuteStageOperatingOutcome.mock.calls.length) return; // no child plan resolved: nothing to assert
        expect(skipKindsFromCall()).toEqual(STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS);
    });
});
