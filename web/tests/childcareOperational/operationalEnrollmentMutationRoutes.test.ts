import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postChildPlacements } from "@/app/api/admin/child-placements/route";
import { POST as postScheduleAssignments } from "@/app/api/admin/schedule-assignments/route";
import { POST as postAgreementEnding } from "@/app/api/admin/child-enrollment-agreements/[id]/ending/route";
import { POST as postAgreementEnded } from "@/app/api/admin/child-enrollment-agreements/[id]/ended/route";
import { POST as postAgreementCancel } from "@/app/api/admin/child-enrollment-agreements/[id]/cancel/route";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

const orgId = "org-1";
const userId = "user-1";
const agreementId = "agr-1";

const {
    mockGetAdminContextCached,
    mockRequireAdminOrOps,
    mockCreateAdminClient,
    mockResolveTodayYmd,
    mockSupersedeChildPlacement,
    mockCreateInitialChildPlacement,
    mockSupersedeScheduleAssignment,
    mockCreateInitialScheduleAssignment,
    mockMarkAgreementEnding,
    mockMarkAgreementEnded,
    mockCancelAgreementBeforeStart,
} = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockRequireAdminOrOps: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockResolveTodayYmd: vi.fn(),
    mockSupersedeChildPlacement: vi.fn(),
    mockCreateInitialChildPlacement: vi.fn(),
    mockSupersedeScheduleAssignment: vi.fn(),
    mockCreateInitialScheduleAssignment: vi.fn(),
    mockMarkAgreementEnding: vi.fn(),
    mockMarkAgreementEnded: vi.fn(),
    mockCancelAgreementBeforeStart: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContextCached,
    };
});

vi.mock("@/lib/adminAuth", () => ({
    requireAdminOrOps: mockRequireAdminOrOps,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: mockCreateAdminClient,
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

vi.mock("@/lib/childcareOperational/childPlacementService", () => ({
    listChildPlacements: vi.fn(),
    createInitialChildPlacement: (...args: unknown[]) => mockCreateInitialChildPlacement(...args),
    supersedeChildPlacement: (...args: unknown[]) => mockSupersedeChildPlacement(...args),
}));

vi.mock("@/lib/childcareOperational/scheduleAssignmentService", () => ({
    listScheduleAssignments: vi.fn(),
    createInitialScheduleAssignment: (...args: unknown[]) =>
        mockCreateInitialScheduleAssignment(...args),
    supersedeScheduleAssignment: (...args: unknown[]) => mockSupersedeScheduleAssignment(...args),
}));

vi.mock("@/lib/childcareOperational/enrollmentAgreementService", () => ({
    markAgreementEnding: (...args: unknown[]) => mockMarkAgreementEnding(...args),
    markAgreementEnded: (...args: unknown[]) => mockMarkAgreementEnded(...args),
    cancelAgreementBeforeStart: (...args: unknown[]) => mockCancelAgreementBeforeStart(...args),
}));

function endingContext() {
    return { params: Promise.resolve({ id: agreementId }) };
}

describe("operational enrollment mutation API routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            role: "admin",
        });
        mockRequireAdminOrOps.mockResolvedValue(null);
        mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
        mockResolveTodayYmd.mockResolvedValue("2026-06-15");
    });

    it("POST child-placements supersede requires admin or ops", async () => {
        mockRequireAdminOrOps.mockResolvedValue(
            new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
        );
        const res = await postChildPlacements(
            new NextRequest("http://localhost/api/admin/child-placements", {
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: agreementId,
                    start_date: "2026-07-01",
                    supersede: true,
                }),
            })
        );
        expect(res.status).toBe(403);
    });

    it("POST child-placements supersede creates via supersedeChildPlacement", async () => {
        mockSupersedeChildPlacement.mockResolvedValue({ id: "pl-2", start_date: "2026-07-01" });
        const res = await postChildPlacements(
            new NextRequest("http://localhost/api/admin/child-placements", {
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: agreementId,
                    start_date: "2026-07-01",
                    program_category_id: "prog-1",
                    supersede: true,
                }),
            })
        );
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.placement.id).toBe("pl-2");
        expect(mockSupersedeChildPlacement).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                orgId,
                enrollmentAgreementId: agreementId,
                startDate: "2026-07-01",
                todayYmd: "2026-06-15",
                actorUserId: userId,
            })
        );
        expect(mockCreateInitialChildPlacement).not.toHaveBeenCalled();
    });

    it("POST child-placements maps service invalid_state to 400", async () => {
        mockSupersedeChildPlacement.mockRejectedValue(
            new OperationalEnrollmentServiceError(
                "invalid_state",
                "No operational placement to supersede"
            )
        );
        const res = await postChildPlacements(
            new NextRequest("http://localhost/api/admin/child-placements", {
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: agreementId,
                    start_date: "2026-07-01",
                    supersede: true,
                }),
            })
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.code).toBe("invalid_state");
    });

    it("POST schedule-assignments supersede creates via supersedeScheduleAssignment", async () => {
        mockSupersedeScheduleAssignment.mockResolvedValue({
            id: "sa-2",
            schedule_pattern_id: "pat-1",
        });
        const res = await postScheduleAssignments(
            new NextRequest("http://localhost/api/admin/schedule-assignments", {
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: agreementId,
                    schedule_pattern_id: "pat-1",
                    start_date: "2026-08-01",
                    supersede: true,
                }),
            })
        );
        expect(res.status).toBe(201);
        expect(mockSupersedeScheduleAssignment).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                orgId,
                enrollmentAgreementId: agreementId,
                schedulePatternId: "pat-1",
                startDate: "2026-08-01",
                actorUserId: userId,
            })
        );
    });

    it("POST schedule-assignments returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await postScheduleAssignments(
            new NextRequest("http://localhost/api/admin/schedule-assignments", {
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: agreementId,
                    schedule_pattern_id: "pat-1",
                    start_date: "2026-08-01",
                    supersede: true,
                }),
            })
        );
        expect(res.status).toBe(401);
    });

    it("POST agreement ending marks agreement ending", async () => {
        mockMarkAgreementEnding.mockResolvedValue({
            id: agreementId,
            status: "ending",
            end_date: "2026-08-01",
        });
        const res = await postAgreementEnding(
            new NextRequest(
                `http://localhost/api/admin/child-enrollment-agreements/${agreementId}/ending`,
                {
                    method: "POST",
                    body: JSON.stringify({ end_date: "2026-08-01" }),
                }
            ),
            endingContext()
        );
        expect(res.status).toBe(200);
        expect(mockMarkAgreementEnding).toHaveBeenCalledWith(
            expect.anything(),
            orgId,
            agreementId,
            "2026-08-01",
            "2026-06-15",
            userId
        );
    });

    it("POST agreement ending requires end_date", async () => {
        const res = await postAgreementEnding(
            new NextRequest(
                `http://localhost/api/admin/child-enrollment-agreements/${agreementId}/ending`,
                { method: "POST", body: JSON.stringify({}) }
            ),
            endingContext()
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.code).toBe("invalid_input");
    });

    it("POST agreement ended marks agreement ended", async () => {
        mockMarkAgreementEnded.mockResolvedValue({
            id: agreementId,
            status: "ended",
            end_date: "2026-06-15",
        });
        const res = await postAgreementEnded(
            new NextRequest(
                `http://localhost/api/admin/child-enrollment-agreements/${agreementId}/ended`,
                {
                    method: "POST",
                    body: JSON.stringify({ end_date: "2026-06-15" }),
                }
            ),
            endingContext()
        );
        expect(res.status).toBe(200);
        expect(mockMarkAgreementEnded).toHaveBeenCalledWith(
            expect.anything(),
            orgId,
            agreementId,
            userId,
            "2026-06-15"
        );
    });

    it("POST agreement cancel cancels pending_start agreement", async () => {
        mockCancelAgreementBeforeStart.mockResolvedValue({
            id: agreementId,
            status: "canceled",
        });
        const res = await postAgreementCancel(
            new NextRequest(
                `http://localhost/api/admin/child-enrollment-agreements/${agreementId}/cancel`,
                { method: "POST" }
            ),
            endingContext()
        );
        expect(res.status).toBe(200);
        expect(mockCancelAgreementBeforeStart).toHaveBeenCalledWith(
            expect.anything(),
            orgId,
            agreementId,
            userId
        );
    });

    it("POST agreement cancel maps invalid_state to 400", async () => {
        mockCancelAgreementBeforeStart.mockRejectedValue(
            new OperationalEnrollmentServiceError(
                "invalid_state",
                "Only pending_start agreements can be canceled"
            )
        );
        const res = await postAgreementCancel(
            new NextRequest(
                `http://localhost/api/admin/child-enrollment-agreements/${agreementId}/cancel`,
                { method: "POST" }
            ),
            endingContext()
        );
        expect(res.status).toBe(400);
    });
});
