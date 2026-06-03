import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    instantiateWork,
    MANUAL_AD_HOC_WORK_DEFINITION_KEY,
    createWorkInstance,
} from "@/lib/admin/operationalWork";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const taskId = "66666666-6666-4666-8666-666666666666";

const mockCreate = vi.fn();
const mockFindDedupe = vi.fn();

vi.mock("@/lib/admin/operationalTasksService", () => ({
    createOperationalTask: (...args: unknown[]) => mockCreate(...args),
    findOpenOperationalTaskForInstantiateDedupe: (...args: unknown[]) => mockFindDedupe(...args),
    listOperationalTasksForWorkspace: vi.fn(),
    listOperationalTasksForEntity: vi.fn(),
    completeOperationalTask: vi.fn(),
    cancelOperationalTask: vi.fn(),
    updateOperationalTaskFields: vi.fn(),
    validateOperationalTaskCreateBody: vi.fn(),
    syncOpportunityNextFollowUpFromOperationalTasks: vi.fn(),
    summarizeOperationalTaskCounts: vi.fn(),
}));

const openTaskRow = (overrides: Partial<OperationalTaskRow> = {}): OperationalTaskRow => ({
    id: taskId,
    org_id: orgId,
    entity_type: "opportunities",
    entity_id: oppId,
    assigned_to_user_id: null,
    created_by: userId,
    title: "Call family",
    description: null,
    due_at: "2027-01-15T12:00:00.000Z",
    status: "open",
    source: "manual",
    proposal_id: null,
    metadata: {
        work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
        shape: "task",
        work_definition_key: "follow_up_after_tour",
        subject_fingerprint: `${orgId}:opportunities:${oppId}`,
        provenance: { source: "manual" },
    },
    created_at: "2027-01-01T00:00:00.000Z",
    updated_at: "2027-01-01T00:00:00.000Z",
    ...overrides,
});

describe("instantiateWork", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindDedupe.mockResolvedValue(null);
    });

    it("creates task-shaped work with metadata v1 and provenance", async () => {
        mockCreate.mockResolvedValue({ ok: true, row: openTaskRow() });

        const result = await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "follow_up_after_tour",
            title: "Call family",
            dueAt: "2027-01-15T12:00:00.000Z",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            category: "follow_up",
        });

        expect(result.status).toBe("created");
        expect(mockCreate).toHaveBeenCalledOnce();
        const call = mockCreate.mock.calls[0]?.[0] as { metadata: Record<string, unknown>; source: string };
        expect(call.source).toBe("manual");
        expect(call.metadata.work_framework_version).toBe(1);
        expect(call.metadata.shape).toBe("task");
        expect(call.metadata.work_definition_key).toBe("follow_up_after_tour");
        expect(call.metadata.subject_fingerprint).toBe(`${orgId}:opportunities:${oppId}`);
        expect(call.metadata.provenance).toEqual({ source: "manual" });
        expect(call.metadata.category).toBe("follow_up");
        if (result.status === "created") {
            expect(result.work.work.work_definition_key).toBe("follow_up_after_tour");
        }
    });

    it("returns deduped when matching open instance exists", async () => {
        const existing = openTaskRow();
        mockFindDedupe.mockResolvedValue(existing);

        const result = await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "follow_up_after_tour",
            title: "Call family",
            dueAt: "2027-01-15T12:00:00.000Z",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "workflow", workflow_run_id: "run-1" },
        });

        expect(result.status).toBe("deduped");
        expect(mockCreate).not.toHaveBeenCalled();
        if (result.status === "deduped") {
            expect(result.existingWork.id).toBe(taskId);
            expect(result.reason).toBe("open_instance_exists");
            expect(result.dedupeKey).toContain("follow_up_after_tour");
        }
    });

    it("allows new creation when prior work is completed", async () => {
        mockFindDedupe.mockResolvedValue(null);
        mockCreate.mockResolvedValue({
            ok: true,
            row: openTaskRow({ status: "open" }),
        });

        const result = await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "follow_up_after_tour",
            title: "Second follow up",
            dueAt: "2027-02-01T12:00:00.000Z",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
        });

        expect(result.status).toBe("created");
        expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("rejects missing required fields", async () => {
        const result = await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            title: "",
            dueAt: "2027-01-15T12:00:00.000Z",
            provenance: { source: "manual" },
        });
        expect(result.status).toBe("rejected");
        if (result.status === "rejected") {
            expect(result.error).toBe("TITLE_REQUIRED");
        }
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("rejects unsupported checklist shape", async () => {
        const result = await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            title: "Weekly review",
            dueAt: "2027-01-15T12:00:00.000Z",
            shape: "checklist" as never,
            provenance: { source: "recurrence" },
        });
        expect(result.status).toBe("rejected");
        if (result.status === "rejected") {
            expect(result.error).toBe("SHAPE_UNSUPPORTED");
        }
    });

    it("maps task_assist_apply provenance to task_assist column source", async () => {
        mockCreate.mockResolvedValue({ ok: true, row: openTaskRow({ source: "task_assist" }) });

        await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            title: "Reminder",
            dueAt: "2027-01-15T12:00:00.000Z",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "task_assist_apply", proposal_id: "44444444-4444-4444-8444-444444444444" },
            proposalId: "44444444-4444-4444-8444-444444444444",
        });

        const call = mockCreate.mock.calls[0]?.[0] as { source: string; metadata: Record<string, unknown> };
        expect(call.source).toBe("task_assist");
        expect(call.metadata.provenance).toMatchObject({
            source: "task_assist",
            proposal_id: "44444444-4444-4444-8444-444444444444",
        });
    });

    it("does not dedupe manual ad hoc by default", async () => {
        mockCreate.mockResolvedValue({ ok: true, row: openTaskRow({ metadata: { work_definition_key: MANUAL_AD_HOC_WORK_DEFINITION_KEY } }) });

        await instantiateWork({
            supabase: {} as never,
            orgId,
            userId,
            title: "Ad hoc",
            dueAt: "2027-01-15T12:00:00.000Z",
            provenance: { source: "manual" },
        });

        expect(mockFindDedupe).toHaveBeenCalledWith(
            expect.objectContaining({ dedupePolicy: "none" }),
        );
        expect(mockCreate).toHaveBeenCalledOnce();
    });
});

describe("createWorkInstance compatibility", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindDedupe.mockResolvedValue(null);
    });

    it("delegates to instantiateWork and preserves framework metadata", async () => {
        mockCreate.mockResolvedValue({
            ok: true,
            row: openTaskRow({
                metadata: {
                    work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
                    shape: "task",
                    category: "follow_up",
                    work_definition_key: MANUAL_AD_HOC_WORK_DEFINITION_KEY,
                    subject_fingerprint: `${orgId}:opportunities:${oppId}`,
                    provenance: { source: "manual" },
                },
            }),
        });

        const res = await createWorkInstance({
            supabase: {} as never,
            orgId,
            userId,
            entityId: oppId,
            title: "Call family",
            description: null,
            dueAtIso: "2027-01-15T12:00:00.000Z",
            source: "manual",
            proposalId: null,
            assignedToUserId: null,
            metadata: { category: "follow_up" },
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.instantiateStatus).toBe("created");
            expect(res.row.work.category).toBe("follow_up");
        }
    });

    it("returns deduped existing row for definition-backed metadata", async () => {
        const existing = openTaskRow();
        mockFindDedupe.mockResolvedValue(existing);

        const res = await createWorkInstance({
            supabase: {} as never,
            orgId,
            userId,
            entityId: oppId,
            title: "Call family",
            description: null,
            dueAtIso: "2027-01-15T12:00:00.000Z",
            source: "manual",
            proposalId: null,
            assignedToUserId: null,
            metadata: { work_definition_key: "follow_up_after_tour" },
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.instantiateStatus).toBe("deduped");
            expect(res.row.id).toBe(taskId);
        }
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
