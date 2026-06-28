import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getExpectations } from "@/app/api/admin/operational-expectations/route";

const orgId = "org-1";
const userId = "user-1";

const { mockGetAdminContextCached, mockCreateAdminClient, mockFetchExpectations, mockResolveTodayYmd } =
    vi.hoisted(() => ({
        mockGetAdminContextCached: vi.fn(),
        mockCreateAdminClient: vi.fn(),
        mockFetchExpectations: vi.fn(),
        mockResolveTodayYmd: vi.fn(),
    }));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));

vi.mock("@/lib/childcareOperational/expectations/fetchScheduleExpectations", () => ({
    fetchScheduleExpectations: (...args: unknown[]) => mockFetchExpectations(...args),
}));

vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/childcareOperational/operationalEnrollmentApi")
    >("@/lib/childcareOperational/operationalEnrollmentApi");
    return {
        ...actual,
        resolveOperationalEnrollmentTodayYmd: (...args: unknown[]) => mockResolveTodayYmd(...args),
    };
});

const sampleModel = {
    expectedAttendance: [
        {
            date: "2026-06-29",
            weekday: 1,
            agreementId: "agr-1",
            customerMemberId: "cm-1",
            siteLocationId: "site-1",
            roomLocationId: "room-1",
            programCategoryId: "prog-1",
            schedulePatternId: "pat-1",
            scheduleTypeKey: "full_time",
        },
    ],
    expectedOccupancyByRoomDate: [{ roomLocationId: "room-1", date: "2026-06-29", childCount: 1 }],
    expectedStaffingByRoomDate: [
        { roomLocationId: "room-1", date: "2026-06-29", childCount: 1, requiredStaff: 1, exceedsDefinedTiers: false },
    ],
    warnings: [],
};

describe("GET /api/admin/operational-expectations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
        mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
        mockResolveTodayYmd.mockResolvedValue("2026-06-29");
        mockFetchExpectations.mockResolvedValue(sampleModel);
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await getExpectations(
            new NextRequest("http://localhost/api/admin/operational-expectations?site_location_id=site-1")
        );
        expect(res.status).toBe(401);
    });

    it("returns 400 when site_location_id is missing", async () => {
        const res = await getExpectations(
            new NextRequest("http://localhost/api/admin/operational-expectations")
        );
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("invalid_input");
    });

    it("returns expected attendance/occupancy/staffing for a site", async () => {
        const res = await getExpectations(
            new NextRequest(
                "http://localhost/api/admin/operational-expectations?site_location_id=site-1&date_start=2026-06-29&date_end=2026-07-03"
            )
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.expectations.expectedAttendance).toHaveLength(1);
        expect(json.expectations.expectedOccupancyByRoomDate[0].childCount).toBe(1);
        expect(json.expectations.expectedStaffingByRoomDate[0].requiredStaff).toBe(1);
        expect(json.range).toEqual({ dateStart: "2026-06-29", dateEnd: "2026-07-03", siteLocationId: "site-1" });
        expect(mockFetchExpectations).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ orgId, siteLocationId: "site-1", dateStart: "2026-06-29", dateEnd: "2026-07-03" })
        );
    });

    it("defaults to a 14-day window from org-local today when dates are omitted", async () => {
        const res = await getExpectations(
            new NextRequest("http://localhost/api/admin/operational-expectations?site_location_id=site-1")
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.range.dateStart).toBe("2026-06-29");
        expect(json.range.dateEnd).toBe("2026-07-12");
    });

    it("returns 400 when the date range is inverted", async () => {
        const res = await getExpectations(
            new NextRequest(
                "http://localhost/api/admin/operational-expectations?site_location_id=site-1&date_start=2026-07-03&date_end=2026-06-29"
            )
        );
        expect(res.status).toBe(400);
    });
});
