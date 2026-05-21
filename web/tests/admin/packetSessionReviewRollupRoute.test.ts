import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESS = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

const buildRollupMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/adminAuth", () => ({
    requireAdminOrOps: vi.fn(async () => null),
}));

vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ({ ok: true, orgId: ORG, userId: USER, role: "admin" })),
    adminContextFailureResponse: vi.fn(),
}));

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/forms/packets/buildPacketReviewRollupV1", () => ({
    buildPacketReviewRollupV1: (...args: unknown[]) => buildRollupMock(...args),
}));

const updateSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: () => ({
            update: updateSpy,
        }),
    })),
}));

const SAMPLE_ROLLUP = {
    contract_version: 1 as const,
    packet_session_id: SESS,
    org_id: ORG,
    status: "completed" as const,
    operator_review: {
        status: "needs_review" as const,
        warnings: [],
        notes: null,
        reviewed_at: null,
        reviewed_by_user_id: null,
    },
    packet_definition: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Pkt", key: null },
    enrollment_context: {
        opportunity_id: null,
        opportunity_label: null,
        customer_id: null,
        customer_label: null,
        launch_surface: null,
        recipient_person_id: null,
    },
    progress: { total_steps: 1, submitted_steps: 1, current_sequence_index: 0 },
    linkage_summary: { any_intake_needs_review: false, steps_missing_crm_fk: 0, steps: [] },
    steps: [],
    documents_index: [],
};

describe("GET /api/admin/forms/packet-sessions/[packetSessionId]/review-rollup", () => {
    beforeEach(() => {
        buildRollupMock.mockReset();
        updateSpy.mockReset();
    });

    it("authorized admin receives rollup (read-only)", async () => {
        buildRollupMock.mockResolvedValue({ ok: true, rollup: SAMPLE_ROLLUP });

        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup/route");
        const res = await GET(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review-rollup`),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ ok: true, rollup: { packet_session_id: SESS, contract_version: 1 } });
        expect(buildRollupMock).toHaveBeenCalledWith(expect.anything(), ORG, SESS);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("returns 404 when builder reports not found", async () => {
        buildRollupMock.mockResolvedValue({ ok: false, error: "Not found", httpStatus: 404 });

        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup/route");
        const res = await GET(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review-rollup`),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );

        expect(res.status).toBe(404);
    });

    it("returns 400 for invalid packet session id", async () => {
        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup/route");
        const res = await GET(
            new NextRequest("http://localhost/api/admin/forms/packet-sessions/not-a-uuid/review-rollup"),
            { params: Promise.resolve({ packetSessionId: "not-a-uuid" }) }
        );

        expect(res.status).toBe(400);
        expect(buildRollupMock).not.toHaveBeenCalled();
    });

    it("returns forbidden when requireAdminOrOps blocks", async () => {
        const { requireAdminOrOps } = await import("@/lib/adminAuth");
        vi.mocked(requireAdminOrOps).mockResolvedValueOnce(
            new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never
        );

        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup/route");
        const res = await GET(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review-rollup`),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );

        expect(res.status).toBe(403);
        expect(buildRollupMock).not.toHaveBeenCalled();
    });

    it("returns 404 when assertRowOrg fails (wrong org)", async () => {
        const { assertRowOrg } = await import("@/lib/admin/assertRowOrg");
        vi.mocked(assertRowOrg).mockResolvedValueOnce({ ok: false } as never);

        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup/route");
        const res = await GET(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review-rollup`),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );

        expect(res.status).toBe(404);
        expect(buildRollupMock).not.toHaveBeenCalled();
    });
});
