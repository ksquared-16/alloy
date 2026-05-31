import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    executeConfirmTourAction,
    executeRecordTourOutcomeAction,
} from "@/lib/admin/actions/executeTourBookingActions";

const confirmTourBooking = vi.fn();
const markTourBookingCompleted = vi.fn();
const markTourBookingNoShow = vi.fn();

vi.mock("@/lib/tours/bookings/tourBookingService", () => ({
    confirmTourBooking: (...args: unknown[]) => confirmTourBooking(...args),
    markTourBookingCompleted: (...args: unknown[]) => markTourBookingCompleted(...args),
    markTourBookingNoShow: (...args: unknown[]) => markTourBookingNoShow(...args),
}));

function supabaseWithBooking(id: string | null) {
    const maybeSingle = vi.fn().mockResolvedValue({
        data: id ? { id, status_key: "pending_approval", start_at: new Date().toISOString() } : null,
        error: null,
    });
    return {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        in: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    maybeSingle,
                                })),
                            })),
                        })),
                    })),
                })),
            })),
        })),
    };
}

describe("executeTourBookingActions", () => {
    beforeEach(() => {
        confirmTourBooking.mockReset();
        markTourBookingCompleted.mockReset();
        markTourBookingNoShow.mockReset();
    });

    it("confirm_tour resolves primary booking and confirms", async () => {
        confirmTourBooking.mockResolvedValue({ id: "bk-1", status_key: "confirmed" });
        const sb = supabaseWithBooking("bk-1");
        const res = await executeConfirmTourAction(sb as never, { orgId: "org-1", userId: "u-1" }, "opp-1", null);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.booking_id).toBe("bk-1");
        expect(confirmTourBooking).toHaveBeenCalledWith(sb, "org-1", "bk-1", { actorUserId: "u-1" });
    });

    it("record_tour_outcome requires outcome enum", async () => {
        const sb = supabaseWithBooking("bk-1");
        const bad = await executeRecordTourOutcomeAction(sb as never, { orgId: "org-1" }, "opp-1", {});
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.error).toMatch(/outcome/i);
    });

    it("record_tour_outcome completes booking", async () => {
        markTourBookingCompleted.mockResolvedValue({ id: "bk-1", status_key: "completed" });
        const sb = supabaseWithBooking("bk-1");
        const res = await executeRecordTourOutcomeAction(sb as never, { orgId: "org-1" }, "opp-1", {
            outcome: "completed",
        });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.outcome).toBe("completed");
    });
});
