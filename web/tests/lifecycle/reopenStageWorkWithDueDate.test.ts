import { beforeEach, describe, expect, it, vi } from "vitest";
import { reopenStageWorkWithDueDate } from "@/lib/lifecycle/reopenStageWorkWithDueDate";

const mockGetOperationalTaskById = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/admin/operationalTasksService", () => ({
    getOperationalTaskById: (...args: unknown[]) => mockGetOperationalTaskById(...args),
}));

describe("reopenStageWorkWithDueDate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetOperationalTaskById.mockResolvedValue({
            ok: true,
            row: { id: "work-1", status: "open", metadata: { attempt_count: 1 } },
        });
        mockMaybeSingle.mockResolvedValue({ data: { id: "work-1" }, error: null });
        mockSelect.mockReturnValue({ maybeSingle: mockMaybeSingle });
        mockEq.mockReturnValue({ eq: mockEq, select: mockSelect, update: mockUpdate });
        mockUpdate.mockReturnValue({ eq: mockEq });
    });

    it("reopens work with a new due date", async () => {
        const supabase = { from: vi.fn(() => ({ update: mockUpdate, eq: mockEq })) };
        const now = new Date("2026-06-10T12:00:00.000Z");

        const result = await reopenStageWorkWithDueDate({
            supabase: supabase as never,
            orgId: "org-1",
            workId: "work-1",
            dueDays: 2,
            now,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.due_at).toBe("2026-06-12T12:00:00.000Z");
        }
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: "open", due_at: "2026-06-12T12:00:00.000Z" }),
        );
    });
});
