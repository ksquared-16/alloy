import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getAgreements, POST as postAgreements } from "@/app/api/admin/child-enrollment-agreements/route";
import { GET as getSummary } from "@/app/api/admin/operational-enrollment/summary/route";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

const orgId = "org-1";
const userId = "user-1";

const {
    mockGetAdminContextCached,
    mockRequireAdminOrOps,
    mockCreateAdminClient,
    mockListAgreements,
    mockCreateAgreement,
    mockResolveTodayYmd,
    mockBuildSummary,
    mockListForMemberSite,
} = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockRequireAdminOrOps: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockListAgreements: vi.fn(),
    mockCreateAgreement: vi.fn(),
    mockResolveTodayYmd: vi.fn(),
    mockBuildSummary: vi.fn(),
    mockListForMemberSite: vi.fn(),
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

vi.mock("@/lib/childcareOperational/enrollmentAgreementService", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/childcareOperational/enrollmentAgreementService")
    >("@/lib/childcareOperational/enrollmentAgreementService");
    return {
        ...actual,
        listChildEnrollmentAgreements: (...args: unknown[]) => mockListAgreements(...args),
        createChildEnrollmentAgreement: (...args: unknown[]) => mockCreateAgreement(...args),
    };
});

vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/childcareOperational/operationalEnrollmentApi")
    >("@/lib/childcareOperational/operationalEnrollmentApi");
    return {
        ...actual,
        resolveOperationalEnrollmentTodayYmd: (...args: unknown[]) => mockResolveTodayYmd(...args),
    };
});

vi.mock("@/lib/childcareOperational/operationalEnrollmentReadModel", () => ({
    buildOperationalEnrollmentReadModelForAgreement: (...args: unknown[]) => mockBuildSummary(...args),
    buildOperationalEnrollmentReadModelForMemberSite: (...args: unknown[]) =>
        mockListForMemberSite(...args),
}));

describe("operational enrollment API routes", () => {
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

    it("GET child-enrollment-agreements returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await getAgreements(
            new NextRequest("http://localhost/api/admin/child-enrollment-agreements")
        );
        expect(res.status).toBe(401);
    });

    it("GET child-enrollment-agreements lists agreements for org", async () => {
        mockListAgreements.mockResolvedValue([{ id: "agr-1", status: "active" }]);
        const res = await getAgreements(
            new NextRequest(
                "http://localhost/api/admin/child-enrollment-agreements?customer_member_id=cm-1"
            )
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.agreements).toHaveLength(1);
        expect(mockListAgreements).toHaveBeenCalledWith(
            expect.anything(),
            orgId,
            expect.objectContaining({ customerMemberId: "cm-1" })
        );
    });

    it("POST child-enrollment-agreements requires admin or ops", async () => {
        mockRequireAdminOrOps.mockResolvedValue(
            new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
        );
        const res = await postAgreements(
            new NextRequest("http://localhost/api/admin/child-enrollment-agreements", {
                method: "POST",
                body: JSON.stringify({
                    customer_member_id: "cm-1",
                    site_location_id: "site-1",
                }),
            })
        );
        expect(res.status).toBe(403);
    });

    it("POST child-enrollment-agreements creates agreement via service", async () => {
        mockCreateAgreement.mockResolvedValue({ id: "agr-new", status: "active" });
        const res = await postAgreements(
            new NextRequest("http://localhost/api/admin/child-enrollment-agreements", {
                method: "POST",
                body: JSON.stringify({
                    customer_member_id: "cm-1",
                    site_location_id: "site-1",
                    start_date: "2026-06-15",
                }),
            })
        );
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.agreement.id).toBe("agr-new");
        expect(mockResolveTodayYmd).toHaveBeenCalled();
        expect(mockCreateAgreement).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                orgId,
                customerMemberId: "cm-1",
                siteLocationId: "site-1",
                todayYmd: "2026-06-15",
                actorUserId: userId,
            })
        );
    });

    it("POST child-enrollment-agreements maps service conflict to 409", async () => {
        mockCreateAgreement.mockRejectedValue(
            new OperationalEnrollmentServiceError("conflict", "already exists")
        );
        const res = await postAgreements(
            new NextRequest("http://localhost/api/admin/child-enrollment-agreements", {
                method: "POST",
                body: JSON.stringify({
                    customer_member_id: "cm-1",
                    site_location_id: "site-1",
                }),
            })
        );
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.code).toBe("conflict");
    });

    it("GET operational-enrollment summary by agreement id", async () => {
        mockBuildSummary.mockResolvedValue({
            agreement: { id: "agr-1" },
            placement: null,
            scheduleAssignment: null,
            schedulePattern: null,
            labels: { site: "Main", program: null, room: null, schedule: null },
            warnings: ["missing_placement"],
        });
        const res = await getSummary(
            new NextRequest(
                "http://localhost/api/admin/operational-enrollment/summary?enrollment_agreement_id=agr-1"
            )
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.summary.agreement.id).toBe("agr-1");
        expect(json.summary.warnings).toContain("missing_placement");
    });

    it("GET operational-enrollment summary by member and site", async () => {
        mockListForMemberSite.mockResolvedValue({
            agreement: { id: "agr-2" },
            placement: null,
            scheduleAssignment: null,
            schedulePattern: null,
            labels: { site: null, program: null, room: null, schedule: null },
            warnings: [],
        });
        const res = await getSummary(
            new NextRequest(
                "http://localhost/api/admin/operational-enrollment/summary?customer_member_id=cm-1&site_location_id=site-1"
            )
        );
        expect(res.status).toBe(200);
        expect(mockListForMemberSite).toHaveBeenCalledWith(
            expect.anything(),
            orgId,
            "cm-1",
            "site-1"
        );
    });
});
