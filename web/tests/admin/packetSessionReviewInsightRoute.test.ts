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
        warnings: [{ kind: "submitted_text_differs_from_crm", message: "Name mismatch with CRM" }],
        notes: null,
        reviewed_at: null,
        reviewed_by_user_id: null,
    },
    packet_definition: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Intake Packet", key: null },
    enrollment_context: {
        opportunity_id: null,
        opportunity_label: null,
        customer_id: null,
        customer_label: null,
        launch_surface: null,
        recipient_person_id: null,
    },
    progress: { total_steps: 2, submitted_steps: 2, current_sequence_index: 1 },
    linkage_summary: {
        any_intake_needs_review: true,
        steps_missing_crm_fk: 1,
        steps: [
            {
                sequence_index: 1,
                form_name: "Acknowledgement",
                intake_needs_review: true,
                has_crm_fk: false,
                admin_submission_path: "/admin/forms/ack/submissions/sub-ack",
            },
        ],
    },
    steps: [
        {
            sequence_index: 1,
            session_item_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            item_status: "submitted",
            submitted_at: "2026-05-01T11:00:00.000Z",
            form_definition_id: "12121212-1212-4121-8121-121212121212",
            form_name: "Acknowledgement",
            form_key: "ack",
            form_submission_id: "34343434-3434-4343-8343-343434343434",
            submission_status: "submitted",
            form_definition_version_id: "56565656-5656-4656-8656-565656565656",
            version_number: 1,
            has_pdf_mapping: false,
            artifact: {
                kind: "submitted_record" as const,
                label: "Submitted form record",
                documents: [],
                admin_submission_path: "/admin/forms/ack/submissions/sub-ack",
                helper_text: null,
            },
            answer_view: null,
            intake_meta: {
                intake_needs_review: true,
                intake_review_reason: "missing_customer",
                intake_resolution_path: null,
            },
        },
    ],
    documents_index: [],
};

describe("GET /api/admin/forms/packet-sessions/[packetSessionId]/review-insight", () => {
    beforeEach(() => {
        buildRollupMock.mockReset();
        updateSpy.mockReset();
    });

    it("authorized admin receives insight (read-only)", async () => {
        buildRollupMock.mockResolvedValue({ ok: true, rollup: SAMPLE_ROLLUP });

        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-insight/route");
        const res = await GET(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review-insight`),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.insight.contract_version).toBe(1);
        expect(body.insight.packet_session_id).toBe(SESS);
        expect(body.insight.readiness_state).toBe("needs_attention");
        expect(body.insight.summary_bullets.length).toBeGreaterThan(0);
        expect(body.insight.human_authority_note).toContain("nothing applies automatically");
        expect(buildRollupMock).toHaveBeenCalledWith(expect.anything(), ORG, SESS);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("returns 404 when builder reports not found", async () => {
        buildRollupMock.mockResolvedValue({ ok: false, error: "Not found", httpStatus: 404 });

        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-insight/route");
        const res = await GET(
            new NextRequest(`http://localhost/api/admin/forms/packet-sessions/${SESS}/review-insight`),
            { params: Promise.resolve({ packetSessionId: SESS }) }
        );

        expect(res.status).toBe(404);
    });

    it("returns 400 for invalid packet session id", async () => {
        const { GET } = await import("@/app/api/admin/forms/packet-sessions/[packetSessionId]/review-insight/route");
        const res = await GET(
            new NextRequest("http://localhost/api/admin/forms/packet-sessions/not-a-uuid/review-insight"),
            { params: Promise.resolve({ packetSessionId: "not-a-uuid" }) }
        );

        expect(res.status).toBe(400);
        expect(buildRollupMock).not.toHaveBeenCalled();
    });
});
