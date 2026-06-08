import { describe, expect, it, vi, beforeEach } from "vitest";

import { instantiateWorkFromDefinition } from "@/lib/admin/operationalWork/instantiateWorkFromDefinition";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const taskId = "66666666-6666-4666-8666-666666666666";
const ownerId = "55555555-5555-5555-8555-555555555555";

const mockInstantiateWork = vi.fn();
const mockFetchOwner = vi.fn();

vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({
    instantiateWork: (...args: unknown[]) => mockInstantiateWork(...args),
}));

vi.mock("@/lib/admin/operationalWork/workDefinitionAssigneeResolution", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/operationalWork/workDefinitionAssigneeResolution")>();
    return {
        ...actual,
        fetchOpportunityRecordOwnerUserId: (...args: unknown[]) => mockFetchOwner(...args),
    };
});

const taskRow = (overrides: Partial<OperationalTaskRow> = {}): OperationalTaskRow => ({
    id: taskId,
    org_id: orgId,
    entity_type: "opportunities",
    entity_id: oppId,
    assigned_to_user_id: ownerId,
    created_by: userId,
    title: "Contact family",
    description: null,
    due_at: "2027-01-02T12:00:00.000Z",
    status: "open",
    source: "manual",
    proposal_id: null,
    metadata: {
        work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
        shape: "task",
        work_definition_key: "contact_family",
        suggested_action_keys: ["create_task"],
        provenance: { source: "manual" },
    },
    created_at: "2027-01-01T00:00:00.000Z",
    updated_at: "2027-01-01T00:00:00.000Z",
    ...overrides,
});

describe("instantiateWorkFromDefinition", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchOwner.mockResolvedValue(ownerId);
    });

    it("creates work by delegating to instantiateWork", async () => {
        mockInstantiateWork.mockResolvedValue({
            status: "created",
            work: { ...taskRow(), work: {} },
            dedupeKey: "dedupe-1",
        });

        const result = await instantiateWorkFromDefinition({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "contact_family",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            now: new Date("2027-01-01T12:00:00.000Z"),
        });

        expect(result.status).toBe("created");
        expect(mockInstantiateWork).toHaveBeenCalledOnce();
        const request = mockInstantiateWork.mock.calls[0]?.[0] as {
            workDefinitionKey: string;
            suggestedActionKeys: string[];
            assignedToUserId: string;
        };
        expect(request.workDefinitionKey).toBe("contact_family");
        expect(request.suggestedActionKeys).toEqual(["create_task"]);
        expect(request.assignedToUserId).toBe(ownerId);
        expect(mockFetchOwner).toHaveBeenCalledOnce();
    });

    it("returns deduped when instantiateWork dedupes", async () => {
        const existing = taskRow();
        mockInstantiateWork.mockResolvedValue({
            status: "deduped",
            existingWork: { ...existing, work: {} },
            dedupeKey: "dedupe-1",
            reason: "open_instance_exists",
        });

        const result = await instantiateWorkFromDefinition({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "contact_family",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
        });

        expect(result.status).toBe("deduped");
    });

    it("rejects disabled definitions", async () => {
        const metadata = {
            lifecycle_work_definitions_v1: {
                version: 1,
                definitions: {
                    contact_family: { enabled: false },
                },
            },
        };

        const result = await instantiateWorkFromDefinition({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "contact_family",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            resolveParams: { departmentMetadata: metadata },
        });

        expect(result.status).toBe("rejected");
        if (result.status === "rejected") {
            expect(result.error).toBe("WORK_DEFINITION_NOT_AVAILABLE");
        }
        expect(mockInstantiateWork).not.toHaveBeenCalled();
    });

    it("rejects unknown definition keys", async () => {
        const result = await instantiateWorkFromDefinition({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "operator_custom",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
        });

        expect(result.status).toBe("rejected");
        expect(mockInstantiateWork).not.toHaveBeenCalled();
    });

    it("passes suggested action keys through to instantiateWork for metadata persistence", async () => {
        mockInstantiateWork.mockResolvedValue({
            status: "created",
            work: taskRow(),
            dedupeKey: null,
        });

        await instantiateWorkFromDefinition({
            supabase: {} as never,
            orgId,
            userId,
            workDefinitionKey: "record_tour_outcome",
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
        });

        const request = mockInstantiateWork.mock.calls[0]?.[0] as { suggestedActionKeys: string[] };
        expect(request.suggestedActionKeys).toContain("record_tour_outcome");
    });
});
