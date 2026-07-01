import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

const mockEmitEvent = vi.fn();
const mockExecuteWorkflowRun = vi.fn();
const mockOnStageEntry = vi.fn();

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => mockEmitEvent(...args),
}));

vi.mock("@/lib/workflowRun", () => ({
    executeWorkflowRun: (...args: unknown[]) => mockExecuteWorkflowRun(...args),
}));

vi.mock("@/lib/lifecycle/onStageEntrySpawnWorkIntent", () => ({
    onStageEntrySpawnWorkIntentFromOpportunityStatusChange: (...args: unknown[]) => mockOnStageEntry(...args),
}));

describe("emitStatusChangedEvent stage entry hook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEmitEvent.mockResolvedValue("event-1");
        mockExecuteWorkflowRun.mockResolvedValue(undefined);
        mockOnStageEntry.mockResolvedValue({ action: "spawned", work_id: "work-1" });

        const workflows = [{ id: "wf-1" }];
        const wq = {
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            then: undefined as unknown,
        };
        Object.defineProperty(wq, "then", {
            value: (resolve: (v: { data: typeof workflows }) => void) => resolve({ data: workflows }),
        });
    });

    function supabaseForEmit() {
        const wq = {
            eq: vi.fn(function eq(this: unknown) {
                return this;
            }),
            or: vi.fn(async () => ({ data: [{ id: "wf-1" }] })),
        };
        return {
            from: vi.fn((table: string) => {
                if (table !== "workflows") throw new Error(`unexpected ${table}`);
                return {
                    select: vi.fn(() => wq),
                };
            }),
        };
    }

    it("invokes onStageEntrySpawnWorkIntent for opportunity status changes", async () => {
        await emitStatusChangedEvent({
            supabase: supabaseForEmit() as never,
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            oldStatusKey: null,
            newStatusKey: "new_inquiry",
            actorUserId: "user-1",
        });

        expect(mockOnStageEntry).toHaveBeenCalledWith({
            supabase: expect.anything(),
            orgId: "org-1",
            userId: "user-1",
            opportunityId: "opp-1",
            previousStatusKey: null,
            nextStatusKey: "new_inquiry",
        });
    });

    it("does not invoke stage entry hook for non-opportunity entities", async () => {
        await emitStatusChangedEvent({
            supabase: supabaseForEmit() as never,
            orgId: "org-1",
            entityType: "jobs",
            entityId: "job-1",
            oldStatusKey: "open",
            newStatusKey: "closed",
            actorUserId: "user-1",
        });

        expect(mockOnStageEntry).not.toHaveBeenCalled();
    });

    it("no-ops before hook when status unchanged", async () => {
        await emitStatusChangedEvent({
            supabase: supabaseForEmit() as never,
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            oldStatusKey: "new_inquiry",
            newStatusKey: "new_inquiry",
            actorUserId: "user-1",
        });

        expect(mockOnStageEntry).not.toHaveBeenCalled();
        expect(mockEmitEvent).not.toHaveBeenCalled();
    });
});
