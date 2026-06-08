import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    ENROLLMENT_RECORD_TOUR_OUTCOME_INSTANTIATE_WORK_PAYLOAD,
    ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE,
    ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE,
    ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
    ENROLLMENT_RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY,
    ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_NAME,
    ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_KEY,
    ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_SPEC,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/enrollmentRecordTourOutcomeWorkflowSeed";
import { parseInstantiateWorkWorkflowActionPayload } from "@/lib/admin/operationalWork/workflowInstantiateWork/parseInstantiateWorkWorkflowActionPayload";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";

const migrationPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../supabase/migrations/20260605120000_enrollment_record_tour_outcome_instantiate_work.sql",
);

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const ownerId = "55555555-5555-5555-8555-555555555555";
const oppId = "33333333-3333-4333-8333-333333333333";
const workflowId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const runId = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
const eventId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const taskId = "66666666-6666-4666-8666-666666666666";

const mockInstantiate = vi.fn();

vi.mock("@/lib/admin/operationalWork/instantiateWorkFromDefinition", () => ({
    instantiateWorkFromDefinition: (...args: unknown[]) => mockInstantiate(...args),
}));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
}));

import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";

describe("enrollment record tour outcome workflow seed spec", () => {
    it("defines valid instantiate_work action payload", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload(
            ENROLLMENT_RECORD_TOUR_OUTCOME_INSTANTIATE_WORK_PAYLOAD,
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.work_definition_key).toBe("record_tour_outcome");
        expect(parsed.payload.subject.mode).toBe("event_primary_entity");
    });

    it("matches migration SQL seed identifiers", () => {
        const sql = readFileSync(migrationPath, "utf8");
        expect(sql).toContain(ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_NAME);
        expect(sql).toContain(`'${ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE}'`);
        expect(sql).toContain(`'${ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE}'`);
        expect(sql).toContain(`'${ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY}'`);
        expect(sql).toContain(`'${ENROLLMENT_RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY}'`);
        expect(sql).toContain("'instantiate_work'");
        expect(sql).toContain(`'${ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_KEY}'`);
    });

    it("uses tour_scheduled trigger (documented alternative to tour_completed)", () => {
        expect(ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_SPEC.conditionValue).toBe("tour_scheduled");
        expect(ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_SPEC.eventType).toBe("opportunity_status_changed");
    });
});

describe("emitStatusChangedEvent fans out to C4 seed workflow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("queries workflows on opportunity_status_changed for opportunities entity", async () => {
        const executeSpy = vi.spyOn(await import("@/lib/workflowRun"), "executeWorkflowRun");
        executeSpy.mockResolvedValue({ ok: true, status: "completed", workflow_run_id: runId });

        const chain: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; or: ReturnType<typeof vi.fn> } = {
            select: vi.fn(),
            eq: vi.fn(),
            or: vi.fn().mockResolvedValue({ data: [{ id: workflowId }], error: null }),
        };
        chain.select.mockReturnValue(chain);
        chain.eq.mockReturnValue(chain);

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "workflows") return chain;
                throw new Error(`unexpected table ${table}`);
            }),
        } as never;

        await emitStatusChangedEvent({
            supabase,
            orgId,
            entityType: "opportunities",
            entityId: oppId,
            oldStatusKey: "qualification",
            newStatusKey: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
            actorUserId: userId,
        });

        expect(chain.select).toHaveBeenCalledWith("id");
        expect(chain.eq).toHaveBeenCalledWith("enabled", true);
        expect(chain.eq).toHaveBeenCalledWith("event_type", ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE);
        expect(chain.eq).toHaveBeenCalledWith("entity_type", "opportunities");
        expect(executeSpy).toHaveBeenCalledWith(
            supabase,
            workflowId,
            expect.objectContaining({
                event_type: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE,
                entity_type: "opportunities",
                entity_id: oppId,
                new_status_key: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
                actor_user_id: userId,
            }),
            expect.objectContaining({ event_id: eventId, org_id: orgId }),
        );

        executeSpy.mockRestore();
    });
});

function buildStatusChangedPayload(overrides: Record<string, unknown> = {}) {
    return {
        event_type: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE,
        occurred_at: "2027-01-01T00:00:00.000Z",
        org_id: orgId,
        entity_type: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE,
        entity_id: oppId,
        old_status_key: "qualification",
        new_status_key: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
        actor_user_id: userId,
        ...overrides,
    };
}

function buildSeedWorkflowSupabase(params: {
    instantiateResult: unknown;
    duplicateInstantiate?: boolean;
}) {
    const actionRunIds: string[] = [];
    let instantiateCallCount = 0;

    mockInstantiate.mockImplementation(async () => {
        instantiateCallCount += 1;
        if (params.duplicateInstantiate && instantiateCallCount > 1) {
            return {
                status: "deduped",
                existingWork: {
                    id: taskId,
                    org_id: orgId,
                    entity_type: "opportunities",
                    entity_id: oppId,
                    status: "open",
                    title: "Record tour outcome",
                    due_at: "2027-01-02T12:00:00.000Z",
                    source: "manual",
                    metadata: { work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION },
                },
                dedupeKey: "dedupe-1",
                reason: "open_instance_exists",
            };
        }
        return params.instantiateResult;
    });

    const workflowRow = {
        id: workflowId,
        name: ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_NAME,
        event_type: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE,
        entity_type: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE,
        enabled: true,
        org_id: orgId,
    };

    const conditionRows = [
        {
            target_entity: null,
            field_path: null,
            field: "new_status_key",
            operator: "eq",
            value: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
            value_jsonb: null,
            enabled: true,
        },
    ];

    const actionRows = [
        {
            id: actionId,
            action_order: 1,
            action_type: "instantiate_work",
            target_entity: null,
            payload: ENROLLMENT_RECORD_TOUR_OUTCOME_INSTANTIATE_WORK_PAYLOAD,
        },
    ];

    const opportunityRow = {
        id: oppId,
        org_id: orgId,
        assigned_to: ownerId,
        status_key: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
        metadata: {},
    };

    type Chain = {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        order: ReturnType<typeof vi.fn>;
        single: ReturnType<typeof vi.fn>;
        maybeSingle: ReturnType<typeof vi.fn>;
    };

    const makeChain = (terminal: () => Promise<{ data: unknown; error: null }>): Chain => {
        const chain = {} as Chain;
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.order = vi.fn(() => terminal());
        chain.single = vi.fn(() => terminal());
        chain.maybeSingle = vi.fn(() => terminal());
        chain.insert = vi.fn(() => ({
            select: vi.fn(() => ({
                single: vi.fn(() =>
                    Promise.resolve({
                        data: { id: `action-run-${actionRunIds.length + 1}` },
                        error: null,
                    }),
                ),
            })),
        }));
        chain.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
        Object.defineProperty(chain, "then", {
            value: (resolve: (v: unknown) => void) => terminal().then(resolve),
            configurable: true,
        });
        return chain;
    };

    const supabase = {
        from: vi.fn((table: string) => {
            switch (table) {
                case "workflows":
                    return makeChain(() => Promise.resolve({ data: workflowRow, error: null }));
                case "workflow_conditions":
                    return makeChain(() => Promise.resolve({ data: conditionRows, error: null }));
                case "workflow_actions":
                    return makeChain(() => Promise.resolve({ data: actionRows, error: null }));
                case "workflow_runs":
                    return {
                        insert: vi.fn(() => Promise.resolve({ error: null })),
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { org_id: orgId }, error: null })),
                            })),
                        })),
                        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
                    };
                case "workflow_action_runs":
                    return {
                        insert: vi.fn(() => ({
                            select: vi.fn(() => ({
                                single: vi.fn(() => {
                                    const id = `action-run-${actionRunIds.length + 1}`;
                                    actionRunIds.push(id);
                                    return Promise.resolve({ data: { id }, error: null });
                                }),
                            })),
                        })),
                        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
                    };
                case "opportunities":
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: opportunityRow, error: null })),
                            })),
                        })),
                    };
                default:
                    throw new Error(`unexpected table ${table}`);
            }
        }),
    } as never;

    return { supabase, actionRunIds };
}

describe("executeWorkflowRun C4 seed end-to-end", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates record_tour_outcome work with workflow provenance", async () => {
        const { supabase } = buildSeedWorkflowSupabase({
            instantiateResult: {
                status: "created",
                work: {
                    id: taskId,
                    org_id: orgId,
                    entity_type: "opportunities",
                    entity_id: oppId,
                    status: "open",
                    title: "Record tour outcome",
                    due_at: "2027-01-02T12:00:00.000Z",
                    source: "manual",
                    metadata: {
                        work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
                        provenance: { source: "workflow", workflow_run_id: runId },
                    },
                },
                dedupeKey: "dedupe-1",
            },
        });

        const result = await executeWorkflowRun(supabase, workflowId, buildStatusChangedPayload(), {
            event_id: eventId,
            org_id: orgId,
        });

        expect(result.status).toBe("completed");
        expect(mockInstantiate).toHaveBeenCalledOnce();
        const call = mockInstantiate.mock.calls[0]?.[0] as {
            workDefinitionKey: string;
            provenance: {
                source: string;
                workflow_id: string;
                workflow_run_id: string;
                workflow_event_id: string;
                idempotency_key: string;
                created_by_user_id: string;
            };
        };
        expect(call.workDefinitionKey).toBe(ENROLLMENT_RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY);
        expect(call.provenance.source).toBe("workflow");
        expect(call.provenance.workflow_id).toBe(workflowId);
        expect(call.provenance.workflow_event_id).toBe(eventId);
        expect(call.provenance.created_by_user_id).toBe(userId);
        expect(call.provenance.idempotency_key).toMatch(/:.+$/);
    });

    it("dedupes when open record_tour_outcome work already exists", async () => {
        const { supabase } = buildSeedWorkflowSupabase({
            instantiateResult: {
                status: "created",
                work: {
                    id: taskId,
                    org_id: orgId,
                    entity_type: "opportunities",
                    entity_id: oppId,
                    status: "open",
                    title: "Record tour outcome",
                    due_at: "2027-01-02T12:00:00.000Z",
                    source: "manual",
                    metadata: { work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION },
                },
                dedupeKey: "dedupe-1",
            },
            duplicateInstantiate: true,
        });

        await executeWorkflowRun(supabase, workflowId, buildStatusChangedPayload(), {
            event_id: eventId,
            org_id: orgId,
        });
        await executeWorkflowRun(supabase, workflowId, buildStatusChangedPayload(), {
            event_id: "cccccccc-cccc-4ccc-8ccc-dddddddddddd",
            org_id: orgId,
        });

        expect(mockInstantiate).toHaveBeenCalledTimes(2);
    });

    it("skips run when new_status_key condition does not match", async () => {
        const { supabase } = buildSeedWorkflowSupabase({
            instantiateResult: { status: "created", work: { id: taskId }, dedupeKey: null },
        });

        const result = await executeWorkflowRun(
            supabase,
            workflowId,
            buildStatusChangedPayload({ new_status_key: "tour_completed" }),
            { event_id: eventId, org_id: orgId },
        );

        expect(result.status).toBe("skipped");
        expect(result.skip_reason).toBe("conditions_not_met");
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it("preserves existing workflow action types in workflowRun", () => {
        const workflowRunSrc = join(dirname(fileURLToPath(import.meta.url)), "../../../lib/workflowRun.ts");
        const src = readFileSync(workflowRunSrc, "utf8");
        expect(src).toContain('case "log"');
        expect(src).toContain('case "instantiate_work"');
        expect(src).toContain("Unknown action_type:");
    });

    it("uses record owner executor when actor is absent", async () => {
        const { supabase } = buildSeedWorkflowSupabase({
            instantiateResult: {
                status: "created",
                work: {
                    id: taskId,
                    org_id: orgId,
                    entity_type: "opportunities",
                    entity_id: oppId,
                    status: "open",
                    title: "Record tour outcome",
                    due_at: null,
                    source: "manual",
                    metadata: {},
                },
                dedupeKey: null,
            },
        });

        await executeWorkflowRun(
            supabase,
            workflowId,
            buildStatusChangedPayload({ actor_user_id: undefined }),
            { event_id: eventId, org_id: orgId },
        );

        const call = mockInstantiate.mock.calls[0]?.[0] as {
            userId: string;
            provenance: { executor_user_id: string; created_by_user_id?: string };
        };
        expect(call.userId).toBe(ownerId);
        expect(call.provenance.executor_user_id).toBe(ownerId);
        expect(call.provenance.created_by_user_id).toBeUndefined();
    });
});
