import { describe, expect, it, vi, beforeEach } from "vitest";

import { createWorkInstance, listWorkForWorkspace, completeWorkInstance } from "@/lib/admin/operationalWork";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const taskId = "66666666-6666-4666-8666-666666666666";

const mockCreate = vi.fn();
const mockFindDedupe = vi.fn();
const mockListWorkspace = vi.fn();
const mockComplete = vi.fn();

vi.mock("@/lib/admin/operationalTasksService", () => ({
    createOperationalTask: (...args: unknown[]) => mockCreate(...args),
    findOpenOperationalTaskForInstantiateDedupe: (...args: unknown[]) => mockFindDedupe(...args),
    listOperationalTasksForWorkspace: (...args: unknown[]) => mockListWorkspace(...args),
    completeOperationalTask: (...args: unknown[]) => mockComplete(...args),
    listOperationalTasksForEntity: vi.fn(),
    summarizeOperationalTaskCounts: vi.fn(),
    cancelOperationalTask: vi.fn(),
    updateOperationalTaskFields: vi.fn(),
    validateOperationalTaskCreateBody: vi.fn(),
    syncOpportunityNextFollowUpFromOperationalTasks: vi.fn(),
}));

const taskRow = (): OperationalTaskRow => ({
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
        provenance: { source: "manual" },
    },
    created_at: "2027-01-01T00:00:00.000Z",
    updated_at: "2027-01-01T00:00:00.000Z",
});

describe("operationalWorkService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindDedupe.mockResolvedValue(null);
    });

    it("createWorkInstance delegates to instantiateWork with framework metadata", async () => {
        mockCreate.mockResolvedValue({ ok: true, row: taskRow() });

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
        expect(mockCreate).toHaveBeenCalledOnce();
        const call = mockCreate.mock.calls[0]?.[0] as { metadata: Record<string, unknown> };
        expect(call.metadata.work_framework_version).toBe(1);
        expect(call.metadata.shape).toBe("task");
        expect(call.metadata.category).toBe("follow_up");
        expect(call.metadata.provenance).toEqual({ source: "manual" });
        if (res.ok) {
            expect(res.row.work.shape).toBe("task");
            expect(res.row.work.provenance.source).toBe("manual");
            expect(res.instantiateStatus).toBe("created");
        }
    });

    it("createWorkInstance forwards rejection from instantiateWork", async () => {
        const res = await createWorkInstance({
            supabase: {} as never,
            orgId,
            userId,
            entityId: null,
            title: "",
            description: null,
            dueAtIso: "2027-01-15T12:00:00.000Z",
            source: "manual",
            proposalId: null,
            assignedToUserId: null,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toBe("TITLE_REQUIRED");
        }
    });

    it("listWorkForWorkspace attaches work view to each row", async () => {
        mockListWorkspace.mockResolvedValue({
            ok: true,
            rows: [{ ...taskRow(), entity_label: "Smith family" }],
        });

        const res = await listWorkForWorkspace({
            supabase: {} as never,
            orgId,
            userId,
            filter: "open",
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.rows[0]?.work.shape).toBe("task");
            expect(res.rows[0]?.entity_label).toBe("Smith family");
        }
    });

    it("completeWorkInstance delegates with workId mapped to taskId", async () => {
        mockComplete.mockResolvedValue({
            ok: true,
            row: { ...taskRow(), status: "completed" },
        });

        const res = await completeWorkInstance({
            supabase: {} as never,
            orgId,
            workId: taskId,
        });

        expect(mockComplete).toHaveBeenCalledWith({
            supabase: expect.anything(),
            orgId,
            taskId,
        });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.row.status).toBe("completed");
    });
});
