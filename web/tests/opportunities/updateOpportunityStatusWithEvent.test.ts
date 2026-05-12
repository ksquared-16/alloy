import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

const emitStatusChangedEvent = vi.fn();
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: (...args: unknown[]) => emitStatusChangedEvent(...args),
}));

function supabaseStub(
    statusFromFetch: string | null,
    updateErr: { message: string } | null = null,
    updatedRowIds: string[] | null = ["opp-1"]
) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { status_key: statusFromFetch }, error: null });
    const fetchEqOrg = vi.fn().mockReturnValue({ maybeSingle });
    const fetchEqId = vi.fn().mockReturnValue({ eq: fetchEqOrg });
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEqId });

    const updateSelect = vi.fn().mockResolvedValue({
        data: updatedRowIds,
        error: updateErr,
    });
    const updateEqOrg = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
    const update = vi.fn().mockReturnValue({ eq: updateEqId });
    return {
        from: vi.fn().mockReturnValue({
            select: fetchSelect,
            update,
        }),
        _maybeSingle: maybeSingle,
        _updateSelect: updateSelect,
    };
}

describe("updateOpportunityStatusWithEvent", () => {
    beforeEach(() => {
        emitStatusChangedEvent.mockReset();
        emitStatusChangedEvent.mockResolvedValue({} as never);
    });

    it("loads previous status with org scope, updates row, and delegates to emitStatusChangedEvent once", async () => {
        const sb = supabaseStub("needs_a_quote", null);
        const res = await updateOpportunityStatusWithEvent({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            newStatusKey: "booked",
            additionalPatch: { quote_total: 99 },
            actorUserId: null,
            eventMetadata: { source: "book-v2", booking_attempt_id: "ba-1" },
            normalizeContext: "test",
        });
        expect(res.error).toBeNull();
        expect(sb.from).toHaveBeenCalledWith("opportunities");
        expect(emitStatusChangedEvent).toHaveBeenCalledTimes(1);
        expect(emitStatusChangedEvent.mock.calls[0]![0]).toMatchObject({
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            oldStatusKey: "needs_a_quote",
            newStatusKey: "booked",
            actorUserId: undefined,
        });
        const meta = emitStatusChangedEvent.mock.calls[0]![0].metadata as Record<string, unknown>;
        expect(meta?.source).toBe("book-v2");
        expect(meta?.booking_attempt_id).toBe("ba-1");
    });

    it("does not emit when the DB update fails", async () => {
        const sb = supabaseStub("needs_a_quote", { message: "write failed" });
        const res = await updateOpportunityStatusWithEvent({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            newStatusKey: "booked",
            normalizeContext: "test",
        });
        expect(res.error?.message).toBe("write failed");
        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
    });

    it("returns error and does not emit when update affects 0 rows", async () => {
        const sb = supabaseStub("needs_a_quote", null, []);
        const res = await updateOpportunityStatusWithEvent({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            newStatusKey: "booked",
            normalizeContext: "test",
        });
        expect(res.error?.message).toContain("0 rows");
        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
    });

    it("uses explicit previousStatusKey without a select", async () => {
        const updateSelect = vi.fn().mockResolvedValue({ data: [{ id: "opp-x" }], error: null });
        const updateEqOrg = vi.fn().mockReturnValue({ select: updateSelect });
        const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
        const supabase = {
            from: vi.fn().mockReturnValue({
                update: vi.fn().mockReturnValue({ eq: updateEqId }),
            }),
        };
        await updateOpportunityStatusWithEvent({
            supabase: supabase as never,
            orgId: "org-x",
            opportunityId: "opp-x",
            newStatusKey: "booked",
            previousStatusKey: "quoted",
            normalizeContext: "test",
        });
        expect(supabase.from).toHaveBeenCalledWith("opportunities");
        const selectMock = supabase.from().select as undefined | ReturnType<typeof vi.fn>;
        expect(selectMock).toBeUndefined();
        expect(emitStatusChangedEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                oldStatusKey: "quoted",
                newStatusKey: "booked",
            })
        );
    });
});
