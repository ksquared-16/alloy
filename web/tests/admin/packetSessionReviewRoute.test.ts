import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESS = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const OPP = "22222222-2222-4222-8222-222222222222";
const PDEF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

const emitEventMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEventMock(...(args as [])),
}));

const ensurePdfMock = vi.hoisted(() =>
    vi.fn(async (_supabase: unknown, _orgId: string, _packetSessionId: string) => ({
        submissionIds: [] as string[],
        attempted: 0,
        createdOrReused: 0,
        skipped: 0,
        errors: [] as string[],
    }))
);
vi.mock("@/lib/forms/packets/ensureGeneratedPdfsForApprovedPacketSession", () => ({
    ensureGeneratedPdfsForApprovedPacketSession: (supabase: unknown, orgId: string, packetSessionId: string) =>
        ensurePdfMock(supabase, orgId, packetSessionId),
}));

const mockCreateAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => mockCreateAdminClient(),
}));

function sessionRow(operatorReviewStatus: string | null, status: string = "completed") {
    return {
        id: SESS,
        org_id: ORG,
        status,
        operator_review_status: operatorReviewStatus,
        crm_snapshot: { opportunity_id: OPP },
        launch_context: {},
        packet_definition_id: PDEF,
    };
}

function makeClient(
    operatorReviewStatus: string | null,
    opts?: { sessionStatus?: string; updateReturnsRow?: boolean }
) {
    const sr = sessionRow(operatorReviewStatus, opts?.sessionStatus ?? "completed");
    const updateReturnsRow = opts?.updateReturnsRow !== false;
    return {
        from(table: string) {
            if (table !== "form_packet_sessions") throw new Error(`unexpected table ${table}`);
            return {
                select(sel: string) {
                    if (sel === "id") {
                        return {
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { id: SESS }, error: null }),
                                }),
                            }),
                        };
                    }
                    return {
                        eq: () => ({
                            maybeSingle: async () => ({ data: sr, error: null }),
                        }),
                    };
                },
                update: () => ({
                    eq: () => ({
                        eq: () => ({
                            select: () => ({
                                maybeSingle: async () =>
                                    updateReturnsRow ? { data: { id: SESS }, error: null } : { data: null, error: null },
                            }),
                        }),
                    }),
                }),
            };
        },
    };
}

describe("PATCH /api/admin/forms/packet-sessions/[packetSessionId]/review", () => {
    beforeEach(() => {
        emitEventMock.mockClear();
        ensurePdfMock.mockClear();
        mockCreateAdminClient.mockReset();
    });

    it("approves when operator_review_status is null (legacy completed)", async () => {
        mockCreateAdminClient.mockReturnValue(makeClient(null));
        const { PATCH } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review/route");
        const res = await PATCH(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review`, {
                method: "PATCH",
                body: JSON.stringify({ operator_review_status: "approved" }),
            }),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok?: boolean; operator_review_status?: string };
        expect(body).toMatchObject({ ok: true, operator_review_status: "approved" });
        expect(ensurePdfMock).toHaveBeenCalledTimes(1);
        const pdfCall = ensurePdfMock.mock.calls[0] as unknown[] | undefined;
        expect(pdfCall?.[1]).toBe(ORG);
        expect(pdfCall?.[2]).toBe(SESS);
        expect(emitEventMock).toHaveBeenCalledTimes(1);
        const firstCall = emitEventMock.mock.calls[0] as unknown[] | undefined;
        expect(firstCall?.[0]).toMatchObject({
            event_type: "opportunity_enrollment_packet_review_decision",
            entity_id: OPP,
        });
    });

    it("needs_correction when operator_review_status is needs_review", async () => {
        mockCreateAdminClient.mockReturnValue(makeClient("needs_review"));
        const { PATCH } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review/route");
        const res = await PATCH(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review`, {
                method: "PATCH",
                body: JSON.stringify({ operator_review_status: "needs_correction" }),
            }),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok?: boolean; operator_review_status?: string };
        expect(body).toMatchObject({ ok: true, operator_review_status: "needs_correction" });
        expect(ensurePdfMock).not.toHaveBeenCalled();
        expect(emitEventMock).toHaveBeenCalled();
    });

    it("409 when already approved", async () => {
        mockCreateAdminClient.mockReturnValue(makeClient("approved"));
        const { PATCH } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review/route");
        const res = await PATCH(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review`, {
                method: "PATCH",
                body: JSON.stringify({ operator_review_status: "needs_correction" }),
            }),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );
        expect(res.status).toBe(409);
    });
});
