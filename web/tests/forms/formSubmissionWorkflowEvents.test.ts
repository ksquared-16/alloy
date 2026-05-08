import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    applyPacketCorrelationToWorkflowPayload,
    buildFormSubmissionWorkflowPayload,
    buildFormSubmissionWorkflowPayloadBase,
    type PacketWorkflowCorrelation,
} from "@/lib/forms/workflow/formSubmissionEvents";

const SUB_ID = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

function sampleSubmission() {
    return {
        id: SUB_ID,
        org_id: ORG_ID,
        form_definition_id: "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb",
        form_definition_version_id: "cccccccc-cccc-4ccc-9ccc-cccccccccccc",
        person_id: "dddddddd-dddd-4ddd-9ddd-dddddddddddd",
        customer_id: null as string | null,
        customer_member_id: null as string | null,
        opportunity_id: null as string | null,
        created_via_public_link_id: null as string | null,
    };
}

describe("Form submission workflow payload base (backward compatible)", () => {
    it("includes required ids and omits document_id when absent", () => {
        const p = buildFormSubmissionWorkflowPayloadBase(sampleSubmission());
        expect(p.form_submission_id).toBe(SUB_ID);
        expect(p.form_definition_id).toBe("bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb");
        expect(p.form_definition_version_id).toBe("cccccccc-cccc-4ccc-9ccc-cccccccccccc");
        expect(p.person_id).toBe("dddddddd-dddd-4ddd-9ddd-dddddddddddd");
        expect(p.org_id).toBe(ORG_ID);
        expect(p.public_link_id).toBeNull();
        expect(Object.prototype.hasOwnProperty.call(p, "document_id")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(p, "packet_session_id")).toBe(false);
    });

    it("adds document_id when provided", () => {
        const p = buildFormSubmissionWorkflowPayloadBase(
            {
                ...sampleSubmission(),
                created_via_public_link_id: "eeeeeeee-eeee-4eee-9eee-eeeeeeeeeeee",
            },
            { document_id: "ffffffff-ffff-4fff-9fff-ffffffffffff" }
        );
        expect(p.public_link_id).toBe("eeeeeeee-eeee-4eee-9eee-eeeeeeeeeeee");
        expect(p.document_id).toBe("ffffffff-ffff-4fff-9fff-ffffffffffff");
    });
});

describe("applyPacketCorrelationToWorkflowPayload", () => {
    it("leaves base unchanged when correlation is null", () => {
        const base = buildFormSubmissionWorkflowPayloadBase(sampleSubmission());
        expect(applyPacketCorrelationToWorkflowPayload(base, null)).toEqual(base);
    });

    it("merges packet correlation fields", () => {
        const base = buildFormSubmissionWorkflowPayloadBase(sampleSubmission());
        const correlation: PacketWorkflowCorrelation = {
            packet_session_id: "55555555-5555-4555-8555-555555555555",
            packet_definition_id: "66666666-6666-4666-8666-666666666666",
            packet_item_id: "77777777-7777-4777-8777-777777777777",
            packet_session_item_id: "88888888-8888-4888-8888-888888888888",
            packet_status: "in_progress",
            packet_current_step: 1,
            packet_item_order: 2,
            is_packet_submission: true,
        };
        const merged = applyPacketCorrelationToWorkflowPayload(base, correlation);
        expect(merged.packet_session_id).toBe(correlation.packet_session_id);
        expect(merged.packet_definition_id).toBe(correlation.packet_definition_id);
        expect(merged.packet_item_id).toBe(correlation.packet_item_id);
        expect(merged.packet_session_item_id).toBe(correlation.packet_session_item_id);
        expect(merged.packet_status).toBe("in_progress");
        expect(merged.packet_current_step).toBe(1);
        expect(merged.packet_item_order).toBe(2);
        expect(merged.is_packet_submission).toBe(true);
        expect(merged.form_submission_id).toBe(SUB_ID);
    });
});

const mockCreateAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => mockCreateAdminClient(),
}));

describe("buildFormSubmissionWorkflowPayload (packet correlation fetch)", () => {
    beforeEach(() => {
        mockCreateAdminClient.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns base only when submission is not linked to a packet step", async () => {
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "form_packet_session_items") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: null, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        });

        const p = await buildFormSubmissionWorkflowPayload(sampleSubmission());
        expect(p.form_submission_id).toBe(SUB_ID);
        expect(Object.prototype.hasOwnProperty.call(p, "packet_session_id")).toBe(false);
    });

    it("includes packet correlation when packet session item exists", async () => {
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "form_packet_session_items") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            id: "88888888-8888-4888-8888-888888888888",
                                            packet_session_id: "55555555-5555-4555-8555-555555555555",
                                            packet_item_id: "77777777-7777-4777-8777-777777777777",
                                            sequence_index: 1,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "form_packet_sessions") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            id: "55555555-5555-4555-8555-555555555555",
                                            packet_definition_id: "66666666-6666-4666-8666-666666666666",
                                            status: "in_progress",
                                            current_sequence_index: 1,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        });

        const p = await buildFormSubmissionWorkflowPayload(sampleSubmission());
        expect(p.is_packet_submission).toBe(true);
        expect(p.packet_session_id).toBe("55555555-5555-4555-8555-555555555555");
        expect(p.packet_item_order).toBe(2);
        expect(p.packet_current_step).toBe(1);
    });
});
