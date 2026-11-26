/**
 * A CHILD-GRAIN OUTCOME IS HELD TO THE WORK'S OWNER.
 *
 * Deployed (ad30be55): Ava's Enrolling work `ae0630d7` hangs on the family case and names Ava as its
 * owner (`bp_subject_customer_member_id`, #1471). The guard demanded that a child-grain outcome name
 * A child; nothing checked it named THIS work's child, or this work's family. These drive the real
 * executor with a work row shaped exactly like Ava's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const ORG = "11111111-1111-4111-8111-111111111111";
const DEPT = "33333333-3333-4333-8333-333333333333";
const WORK = "44444444-4444-4444-8444-444444444444";
const FAMILY = "55555555-5555-4555-8555-555555555555";
const OTHER_FAMILY = "66666666-6666-4666-8666-666666666666";
const AVA = "a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0";
const AVA_PI = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const BEN = "b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0";
const BEN_PI = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";

const mockComplete = vi.fn();
const mockExecute = vi.fn();
vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({ completeWorkInstance: (...a: unknown[]) => mockComplete(...a) }));
vi.mock("@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata", () => ({ patchLifecycleWorkIntentAttemptMetadata: vi.fn(async () => ({ ok: true, attempt_count: 1 })) }));
vi.mock("@/lib/lifecycle/reopenStageWorkWithDueDate", () => ({ reopenStageWorkWithDueDate: vi.fn(async () => ({ ok: true, due_at: null })) }));
vi.mock("@/lib/lifecycle/recordStageWorkContactOutcomeTrace", () => ({ recordStageWorkContactOutcomeTrace: vi.fn(async () => ({ logged: true })) }));
vi.mock("@/lib/lifecycle/executeStageOperatingOutcome", () => ({
    executeStageOperatingOutcome: (...a: unknown[]) => mockExecute(...a),
    rollbackStageOperatingOutcome: vi.fn(async () => []),
}));

/*
 * The completion gate is the authority for "every requirement satisfied". Ownership is judged before
 * it; here it is stubbed so each case can say which answer the gate gives.
 */
const mockSufficiency = vi.fn();
vi.mock("@/lib/enrollment/completion/preflightEnrollmentCompletionSufficiency", async (orig) => ({
    ...(await orig<object>()),
    preflightEnrollmentCompletionSufficiency: (...a: unknown[]) => mockSufficiency(...a),
}));

/** A child-grain stage: the plan and the stage both say so. */
const basePlan = defaultStageOperatingPlanForEnrollmentStage("enrolling")!;
const PLAN: StageOperatingPlanV1 = { ...basePlan, stage_key: "enrolling", journey_segment: "child" };
const OUTCOME = PLAN.outcomes[0]!.outcome_key;

const metadata = {
    [LIFECYCLE_BUILDER_METADATA_KEY]: {
        version: 1,
        active_process_id: "p",
        processes: [{
            id: "p", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true,
            stages: [{ id: "s", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true, grain: "child", stage_operating_plan_v1: PLAN }],
        }],
    },
};

/** The work row as deployed: the family is the entity, the child its recorded owner. */
const avaWork = { entity_type: "opportunities", entity_id: FAMILY, status: "open", due_at: null, metadata: { bp_subject_customer_member_id: AVA, bp_subject_process_instance_id: AVA_PI } };

function supabase(work: Record<string, unknown>) {
    return {
        from: vi.fn((table: string) => {
            if (table === "departments") {
                return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: { metadata }, error: null })) };
            }
            if (table === "operational_tasks") {
                return { select: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: { ...work }, error: null })), then: undefined };
            }
            // Participant-decision reads and similar return nothing for this plan.
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: null, error: null })), then: (r: (v: unknown) => void) => r({ data: [], error: null }) };
        }),
    } as never;
}

const run = (subject: Record<string, unknown>, work: Record<string, unknown> = avaWork) =>
    completeStageWorkWithOutcome({
        supabase: supabase(work),
        orgId: ORG,
        userId: "u",
        departmentId: DEPT,
        stageKey: "enrolling",
        workId: WORK,
        outcomeKey: OUTCOME,
        subject: subject as never,
    });

const ava = { journey_segment: "child", opportunity_id: FAMILY, customer_member_id: AVA, process_instance_id: AVA_PI };

beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue({ ok: true, row: { id: WORK, status: "completed" } });
    mockSufficiency.mockResolvedValue({ blocked: false, message: null });
    mockExecute.mockResolvedValue({ applied_targets: [], errors: [], queue_refresh_opportunity_id: FAMILY, needs_attention_set: false, status_updated: true });
});

const nothingWritten = () => {
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
};

describe("a child-grain outcome on child-owned work", () => {
    it("the owning child completes it, and the outcome executes for that child", async () => {
        const r = await run(ava);
        expect(r.ok, (r as { error?: string }).error).toBe(true);
        expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.objectContaining({ customer_member_id: AVA }) }));
    });

    it("a sibling cannot complete it — named by member or by journey", async () => {
        for (const sibling of [
            { ...ava, customer_member_id: BEN, process_instance_id: BEN_PI },
            { journey_segment: "child", opportunity_id: FAMILY, process_instance_id: BEN_PI },
        ]) {
            const r = await run(sibling);
            expect(r.ok).toBe(false);
            expect((r as { error?: string }).error).toMatch(/another child/);
        }
        nothingWritten();
    });

    it("another family cannot complete it", async () => {
        const r = await run({ ...ava, opportunity_id: OTHER_FAMILY });
        expect(r.ok).toBe(false);
        expect((r as { error?: string }).error).toMatch(/different family/);
        nothingWritten();
    });

    it("the guard is intact: a child-grain outcome naming no child is still refused", async () => {
        const r = await run({ journey_segment: "child", opportunity_id: FAMILY });
        expect(r.ok).toBe(false);
        expect((r as { error?: string }).error).toMatch(/Child enrollment subject required/);
        nothingWritten();
    });

    it("work from before items named their child is judged on the family alone", async () => {
        const legacy = { ...avaWork, metadata: {} };
        expect((await run(ava, legacy)).ok).toBe(true);
        const other = await run({ ...ava, opportunity_id: OTHER_FAMILY }, legacy);
        expect(other.ok).toBe(false);
    });
});

describe("ownership does not replace the completion gate", () => {
    it("the owning child is still refused while a requirement is outstanding", async () => {
        mockSufficiency.mockResolvedValue({ blocked: true, message: "Enrollment cannot be completed — 1 requirement outstanding: Registration fee." });
        const r = await run(ava);
        expect(r.ok).toBe(false);
        expect((r as { error?: string }).error).toMatch(/Registration fee/);
        nothingWritten();
        // And the gate was asked about THIS child's journey.
        expect(mockSufficiency).toHaveBeenCalledWith(expect.objectContaining({ processInstanceId: AVA_PI }));
    });
});
