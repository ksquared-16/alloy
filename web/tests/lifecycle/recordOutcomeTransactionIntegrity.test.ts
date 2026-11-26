/**
 * Record Outcome — transaction integrity certification.
 *
 * The defect these tests exist for: recording an outcome closed the work item FIRST and
 * applied the configured Business Process rule targets afterwards. A target failure returned
 * an error to the operator while the work was already closed and the stage had already moved.
 * The operator was told "that failed" by a platform that had already changed durable state.
 *
 * Each test below reproduces one shape of that failure against the real orchestration and
 * asserts the honest ending: either committed, or nothing changed, or — when the platform
 * genuinely cannot clean up — an explicit integrity breach instead of a clean-looking abort.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { PlatformTransactionTrace } from "@/lib/platform/transaction/platformTransaction";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const workId = "44444444-4444-4444-8444-444444444444";
const opportunityId = "55555555-5555-4555-8555-555555555555";

const mockCompleteWorkInstance = vi.fn();
const mockExecuteStageOperatingOutcome = vi.fn();
const mockRollbackStageOperatingOutcome = vi.fn();
const mockRecordContactOutcomeTrace = vi.fn();

vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({
    completeWorkInstance: (...args: unknown[]) => mockCompleteWorkInstance(...args),
}));

vi.mock("@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata", () => ({
    patchLifecycleWorkIntentAttemptMetadata: vi.fn(async () => ({ ok: true, attempt_count: 1 })),
}));

vi.mock("@/lib/lifecycle/reopenStageWorkWithDueDate", () => ({
    reopenStageWorkWithDueDate: vi.fn(async () => ({ ok: true, due_at: new Date().toISOString() })),
}));

vi.mock("@/lib/lifecycle/executeStageOperatingOutcome", () => ({
    executeStageOperatingOutcome: (...args: unknown[]) => mockExecuteStageOperatingOutcome(...args),
    rollbackStageOperatingOutcome: (...args: unknown[]) => mockRollbackStageOperatingOutcome(...args),
}));

vi.mock("@/lib/lifecycle/recordStageWorkContactOutcomeTrace", () => ({
    recordStageWorkContactOutcomeTrace: (...args: unknown[]) => mockRecordContactOutcomeTrace(...args),
}));

/**
 * The durable work row, as the database would hold it. Writes through the fake mutate it, so
 * a test can assert what the operator would actually see after the dust settles.
 */
type WorkRow = { status: string; due_at: string | null; metadata: Record<string, unknown> };
let workRow: WorkRow;
let restoreShouldFail = false;

function departmentMetadata(): Record<string, unknown> {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
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
                    stages: [
                        {
                            id: "stage-lead",
                            key: plan.stage_key,
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: plan,
                        },
                    ],
                },
            ],
        },
    };
}

function makeSupabase() {
    const metadata = departmentMetadata();
    return {
        from: (table: string) => {
            if (table === "departments") {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = async () => ({ data: { metadata }, error: null });
                return chain;
            }
            if (table === "operational_tasks") {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = async () => ({ data: { ...workRow }, error: null });
                chain.update = (patch: Partial<WorkRow>) => {
                    if (restoreShouldFail) {
                        return { eq: () => ({ eq: async () => ({ error: { message: "row is locked" } }) }) };
                    }
                    workRow = { ...workRow, ...patch };
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                };
                return chain;
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

const baseInput = () => ({
    supabase: makeSupabase() as never,
    orgId,
    userId,
    departmentId,
    stageKey: "lead",
    workId,
    outcomeKey: "reached_family",
    subject: { journey_segment: "family" as const, opportunity_id: opportunityId },
});

function outcomeExecution(overrides: Record<string, unknown> = {}) {
    return {
        applied_targets: [],
        failed_targets: [],
        errors: [],
        degraded: [],
        queue_refresh_opportunity_id: opportunityId,
        needs_attention_set: false,
        status_updated: true,
        undo: [],
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    workRow = { status: "open", due_at: null, metadata: {} };
    restoreShouldFail = false;
    mockCompleteWorkInstance.mockImplementation(async () => {
        workRow = { ...workRow, status: "completed" };
        return { ok: true, row: { id: workId, status: "completed" } };
    });
    mockExecuteStageOperatingOutcome.mockResolvedValue(outcomeExecution());
    mockRollbackStageOperatingOutcome.mockResolvedValue([]);
    mockRecordContactOutcomeTrace.mockResolvedValue({ logged: true });
});

describe("record outcome — the work item is never left closed by a failed transaction", () => {
    it("REPRODUCES the ghost close: a rule-target failure used to leave the work closed", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue(
            outcomeExecution({ errors: ["move_to_stage: destination stage not found"] }),
        );

        const result = await completeStageWorkWithOutcome(baseInput());

        expect(result.ok).toBe(false);
        expect(result.error).toContain("destination stage not found");
        // The whole point: the operator was told it failed, so it must have failed.
        expect(result.changed).toBe(false);
        expect(result.work_closed).toBe(false);
        expect(workRow.status).toBe("open");
    });

    it("rolls back the rule targets that DID apply before the failing one", async () => {
        const execution = outcomeExecution({
            errors: ["create_next_work: unknown work template"],
            undo: [{ target: { kind: "move_to_stage" }, run: vi.fn() }],
        });
        mockExecuteStageOperatingOutcome.mockResolvedValue(execution);

        const result = await completeStageWorkWithOutcome(baseInput());

        expect(result.ok).toBe(false);
        expect(mockRollbackStageOperatingOutcome).toHaveBeenCalledWith(execution);
        expect(result.changed).toBe(false);
    });

    it("reopens the work when the ACTIVITY record fails — no outcome without its trace", async () => {
        mockRecordContactOutcomeTrace.mockResolvedValue({ logged: false, error: "activity insert denied" });

        const result = await completeStageWorkWithOutcome(baseInput());

        expect(result.ok).toBe(false);
        expect(result.error).toContain("activity insert denied");
        expect(workRow.status).toBe("open");
        expect(result.changed).toBe(false);
        expect(mockRollbackStageOperatingOutcome).toHaveBeenCalled();
    });
});

describe("record outcome — the platform never claims a clean abort it cannot prove", () => {
    it("reports an integrity breach when the work row cannot be restored", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue(outcomeExecution({ errors: ["target failed"] }));
        restoreShouldFail = true;

        const result = await completeStageWorkWithOutcome(baseInput());

        expect(result.ok).toBe(false);
        expect(result.transaction?.outcome).toBe("partially_committed");
        // NOT "nothing changed" — the work row is still closed and the platform says so.
        expect(result.changed).toBe(true);
        expect(result.integrity_breach?.step).toBe("work_state");
        expect(result.error).toContain("rollback did not fully complete");
    });

    it("reports an integrity breach when a rule target cannot be reverted", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue(outcomeExecution({ errors: ["target failed"] }));
        mockRollbackStageOperatingOutcome.mockResolvedValue(["update_family_case_status: restore denied"]);

        const result = await completeStageWorkWithOutcome(baseInput());

        expect(result.transaction?.outcome).toBe("partially_committed");
        expect(result.changed).toBe(true);
        expect(result.integrity_breach?.step).toBe("apply_outcome_rules");
        expect(result.integrity_breach?.error).toContain("restore denied");
    });
});

describe("record outcome — the commit path is unchanged", () => {
    it("commits, closes the work, and reports the transaction", async () => {
        const result = await completeStageWorkWithOutcome(baseInput());

        expect(result.ok).toBe(true);
        expect(result.work_closed).toBe(true);
        expect(workRow.status).toBe("completed");
        expect(result.transaction?.outcome).toBe("committed");
        expect(result.changed).toBe(true);
        expect(mockRollbackStageOperatingOutcome).not.toHaveBeenCalled();
    });

    it("aborts before any write when the configuration does not resolve", async () => {
        const result = await completeStageWorkWithOutcome({ ...baseInput(), outcomeKey: "not_a_configured_outcome" });

        expect(result.ok).toBe(false);
        expect(result.error).toBe("Unknown outcome for stage");
        expect(result.changed).toBe(false);
        expect(workRow.status).toBe("open");
        expect(mockCompleteWorkInstance).not.toHaveBeenCalled();
        expect(mockExecuteStageOperatingOutcome).not.toHaveBeenCalled();
    });
});

describe("record outcome — runtime certification evidence", () => {
    it("emits a correlated, per-step, timed trace for the whole pipeline", async () => {
        const traces: PlatformTransactionTrace[] = [];

        const result = await completeStageWorkWithOutcome({
            ...baseInput(),
            correlationId: "cid-outcome-1",
            onTrace: (t) => traces.push(t),
        });

        expect(result.correlation_id).toBe("cid-outcome-1");
        expect(traces).toHaveLength(1);
        const trace = traces[0];
        expect(trace.capability).toBe("record_outcome");
        expect(trace.actor_user_id).toBe(userId);
        expect(trace.subject).toEqual({
            opportunity_id: opportunityId,
            work_id: workId,
            stage_key: "lead",
            outcome_key: "reached_family",
        });
        expect(trace.steps.map((s) => `${s.stage}:${s.name}`)).toEqual([
            "validate:validate",
            "persist:work_state",
            "business_process:apply_outcome_rules",
            "activity:contact_outcome_trace",
        ]);
        expect(trace.steps.every((s) => s.status === "ok")).toBe(true);
        expect(typeof trace.duration_ms).toBe("number");
    });

    it("traces the compensation pass, so a rollback is auditable rather than invisible", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue(outcomeExecution({ errors: ["target failed"] }));
        const traces: PlatformTransactionTrace[] = [];

        await completeStageWorkWithOutcome({ ...baseInput(), onTrace: (t) => traces.push(t) });

        const statuses = traces[0].steps.map((s) => `${s.name}:${s.status}`);
        expect(statuses).toContain("apply_outcome_rules:failed");
        expect(statuses).toContain("contact_outcome_trace:skipped");
        expect(statuses).toContain("work_state:compensate:compensated");
        expect(traces[0].outcome).toBe("aborted");
        expect(traces[0].changed).toBe(false);
    });

    it("suppresses a double-submit of the same outcome instead of executing twice", async () => {
        const key = `${workId}:reached_family`;
        const [first, second] = await Promise.all([
            completeStageWorkWithOutcome({ ...baseInput(), idempotencyKey: key }),
            completeStageWorkWithOutcome({ ...baseInput(), idempotencyKey: key }),
        ]);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(mockCompleteWorkInstance).toHaveBeenCalledTimes(1);
        expect(second.transaction?.deduplicated).toBe(true);
    });
});
