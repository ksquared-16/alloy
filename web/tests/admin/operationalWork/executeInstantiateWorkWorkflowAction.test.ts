import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { executeInstantiateWorkWorkflowAction } from "@/lib/admin/operationalWork/workflowInstantiateWork/executeInstantiateWorkWorkflowAction";
import { WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE } from "@/lib/admin/operationalWork/workflowInstantiateWork/workflowInstantiateWorkActorPolicy";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const taskId = "66666666-6666-4666-8666-666666666666";
const runId = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
const workflowId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const eventId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const mockInstantiate = vi.fn();

vi.mock("@/lib/admin/operationalWork/instantiateWorkFromDefinition", () => ({
    instantiateWorkFromDefinition: (...args: unknown[]) => mockInstantiate(...args),
}));

const workflowRunSrc = join(dirname(fileURLToPath(import.meta.url)), "../../../lib/workflowRun.ts");

const baseActionPayload = {
    version: 1,
    work_definition_key: "contact_family",
    subject: { mode: "event_primary_entity" },
};

const baseWorkflowPayload = {
    org_id: orgId,
    entity_type: "opportunities",
    entity_id: oppId,
    actor_user_id: userId,
    event_type: "opportunity_status_changed",
};

const taskRow = {
    id: taskId,
    org_id: orgId,
    entity_type: "opportunities",
    entity_id: oppId,
    status: "open",
    title: "Contact family",
    due_at: "2027-01-02T12:00:00.000Z",
    source: "manual",
    metadata: { work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION },
};

describe("executeInstantiateWorkWorkflowAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("parses valid action and calls instantiateWorkFromDefinition", async () => {
        mockInstantiate.mockResolvedValue({
            status: "created",
            work: taskRow,
            dedupeKey: "dedupe-1",
        });

        const result = await executeInstantiateWorkWorkflowAction({
            supabase: {} as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            eventId,
            actionOrder: 2,
            actionPayload: baseActionPayload,
            workflowPayload: baseWorkflowPayload,
        });

        expect(mockInstantiate).toHaveBeenCalledOnce();
        expect(result.status).toBe("completed");
        expect(result.outputs.outcome).toBe("created");
        const call = mockInstantiate.mock.calls[0]?.[0] as {
            workDefinitionKey: string;
            provenance: {
                idempotency_key: string;
                source: string;
                workflow_run_id: string;
                workflow_id: string;
                workflow_event_id: string;
                workflow_event_type: string;
                created_by_user_id: string;
                executor_user_id: string;
                workflow_action_order: number;
                workflow_subject_mapping_mode: string;
            };
            userId: string;
        };
        expect(call.workDefinitionKey).toBe("contact_family");
        expect(call.provenance.source).toBe("workflow");
        expect(call.provenance.workflow_run_id).toBe(runId);
        expect(call.provenance.workflow_id).toBe(workflowId);
        expect(call.provenance.workflow_event_id).toBe(eventId);
        expect(call.provenance.workflow_event_type).toBe("opportunity_status_changed");
        expect(call.provenance.idempotency_key).toBe(`${runId}:2`);
        expect(call.provenance.workflow_action_order).toBe(2);
        expect(call.provenance.workflow_subject_mapping_mode).toBe("event_primary_entity");
        expect(call.provenance.created_by_user_id).toBe(userId);
        expect(call.provenance.executor_user_id).toBe(userId);
        expect(call.userId).toBe(userId);
        expect(result.outputs.subject_fingerprint).toContain(oppId);
    });

    it("marks created result as action success", async () => {
        mockInstantiate.mockResolvedValue({ status: "created", work: taskRow, dedupeKey: null });
        const result = await executeInstantiateWorkWorkflowAction({
            supabase: {} as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            actionOrder: 1,
            actionPayload: baseActionPayload,
            workflowPayload: baseWorkflowPayload,
        });
        expect(result.status).toBe("completed");
        expect(result.outputs.outcome).toBe("created");
        expect(result.outputs.work_id).toBe(taskId);
        expect(result.outputs.task_id).toBe(taskId);
    });

    it("soft succeeds on deduped by default", async () => {
        mockInstantiate.mockResolvedValue({
            status: "deduped",
            existingWork: taskRow,
            dedupeKey: "dedupe-1",
            reason: "open_instance_exists",
        });
        const result = await executeInstantiateWorkWorkflowAction({
            supabase: {} as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            actionOrder: 1,
            actionPayload: baseActionPayload,
            workflowPayload: baseWorkflowPayload,
        });
        expect(result.status).toBe("completed");
        expect(result.outputs.outcome).toBe("deduped");
        expect(result.outputs.existing_work_id).toBe(taskId);
        expect(result.outputs.dedupe_key).toBe("dedupe-1");
        expect(result.outputs.reason).toBe("open_instance_exists");
    });

    it("fails deduped when configured", async () => {
        mockInstantiate.mockResolvedValue({
            status: "deduped",
            existingWork: taskRow,
            dedupeKey: "dedupe-1",
            reason: "open_instance_exists",
        });
        await expect(
            executeInstantiateWorkWorkflowAction({
                supabase: {} as never,
                orgId,
                workflowId,
                workflowRunId: runId,
                actionOrder: 1,
                actionPayload: { ...baseActionPayload, on_deduped: "fail" },
                workflowPayload: baseWorkflowPayload,
            }),
        ).rejects.toThrow(/deduped open work exists/);
    });

    it("skips disabled definition by default", async () => {
        mockInstantiate.mockResolvedValue({
            status: "rejected",
            error: "WORK_DEFINITION_NOT_AVAILABLE",
            message: "disabled",
            reason: "definition_not_available",
            dedupeKey: null,
        });
        const result = await executeInstantiateWorkWorkflowAction({
            supabase: {} as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            actionOrder: 1,
            actionPayload: baseActionPayload,
            workflowPayload: baseWorkflowPayload,
        });
        expect(result.status).toBe("skipped");
        expect(result.outputs.outcome).toBe("skipped");
        expect(result.outputs.reason).toBe("definition_not_available");
    });

    it("fails disabled definition when configured", async () => {
        mockInstantiate.mockResolvedValue({
            status: "rejected",
            error: "WORK_DEFINITION_NOT_AVAILABLE",
            message: "disabled",
            reason: "definition_not_available",
            dedupeKey: null,
        });
        await expect(
            executeInstantiateWorkWorkflowAction({
                supabase: {} as never,
                orgId,
                workflowId,
                workflowRunId: runId,
                actionOrder: 1,
                actionPayload: { ...baseActionPayload, on_disabled_definition: "fail" },
                workflowPayload: baseWorkflowPayload,
            }),
        ).rejects.toThrow(/instantiate_work: disabled/);
    });

    it("fails when subject id is missing", async () => {
        await expect(
            executeInstantiateWorkWorkflowAction({
                supabase: {} as never,
                orgId,
                workflowId,
                workflowRunId: runId,
                actionOrder: 1,
                actionPayload: baseActionPayload,
                workflowPayload: { ...baseWorkflowPayload, entity_id: null, actor_user_id: userId, entity_type: "opportunities" },
            }),
        ).rejects.toThrow(/SUBJECT_ID_MISSING/);
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it("fails rejected results by default", async () => {
        mockInstantiate.mockResolvedValue({
            status: "rejected",
            error: "TITLE_REQUIRED",
            message: "title is required.",
            reason: "missing_title",
            dedupeKey: null,
        });
        await expect(
            executeInstantiateWorkWorkflowAction({
                supabase: {} as never,
                orgId,
                workflowId,
                workflowRunId: runId,
                actionOrder: 1,
                actionPayload: baseActionPayload,
                workflowPayload: baseWorkflowPayload,
            }),
        ).rejects.toThrow(/title is required/);
    });

    it("skips rejected results when configured", async () => {
        mockInstantiate.mockResolvedValue({
            status: "rejected",
            error: "TITLE_REQUIRED",
            message: "title is required.",
            reason: "missing_title",
            dedupeKey: null,
        });
        const result = await executeInstantiateWorkWorkflowAction({
            supabase: {} as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            actionOrder: 1,
            actionPayload: { ...baseActionPayload, on_rejected: "skip" },
            workflowPayload: baseWorkflowPayload,
        });
        expect(result.status).toBe("skipped");
        expect(result.outputs.outcome).toBe("skipped");
        expect(result.outputs.reason).toBe("missing_title");
        expect(result.outputs.message).toBe("title is required.");
    });

    it("does not direct-write operational_tasks", async () => {
        mockInstantiate.mockResolvedValue({ status: "created", work: taskRow, dedupeKey: null });
        const supabase = {
            from: vi.fn(() => {
                throw new Error("direct operational_tasks write forbidden");
            }),
        };
        await executeInstantiateWorkWorkflowAction({
            supabase: supabase as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            actionOrder: 1,
            actionPayload: baseActionPayload,
            workflowPayload: baseWorkflowPayload,
        });
        expect(mockInstantiate).toHaveBeenCalledOnce();
    });

    it("uses opportunity assigned_to when actor is absent", async () => {
        mockInstantiate.mockResolvedValue({ status: "created", work: taskRow, dedupeKey: null });
        const ownerId = "55555555-5555-5555-8555-555555555555";
        await executeInstantiateWorkWorkflowAction({
            supabase: {} as never,
            orgId,
            workflowId,
            workflowRunId: runId,
            actionOrder: 1,
            actionPayload: baseActionPayload,
            workflowPayload: {
                ...baseWorkflowPayload,
                actor_user_id: undefined,
                opportunity: { id: oppId, assigned_to: ownerId },
            },
        });
        const call = mockInstantiate.mock.calls[0]?.[0] as {
            userId: string;
            provenance: { created_by_user_id?: string; executor_user_id: string };
        };
        expect(call.userId).toBe(ownerId);
        expect(call.provenance.executor_user_id).toBe(ownerId);
        expect(call.provenance.created_by_user_id).toBeUndefined();
    });

    it("fails when actor and record owner are missing", async () => {
        await expect(
            executeInstantiateWorkWorkflowAction({
                supabase: {} as never,
                orgId,
                workflowId,
                workflowRunId: runId,
                actionOrder: 1,
                actionPayload: baseActionPayload,
                workflowPayload: {
                    ...baseWorkflowPayload,
                    actor_user_id: undefined,
                    opportunity: { id: oppId, assigned_to: null },
                },
            }),
        ).rejects.toThrow(WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE);
        expect(mockInstantiate).not.toHaveBeenCalled();
    });
});

describe("workflowRun instantiate_work dispatch", () => {
    it("registers instantiate_work handler", () => {
        const src = readFileSync(workflowRunSrc, "utf8");
        expect(src).toContain('case "instantiate_work"');
        expect(src).toContain("executeInstantiateWorkWorkflowAction");
    });

    it("keeps unknown action skip behavior", () => {
        const src = readFileSync(workflowRunSrc, "utf8");
        expect(src).toContain("Unknown action_type:");
        expect(src).toContain("actionSkipped = true");
    });
});
