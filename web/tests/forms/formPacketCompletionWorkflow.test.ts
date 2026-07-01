import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { emitFormPacketCompletedSafe } from "@/lib/forms/workflow/formSubmissionEvents";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PACKET_SESSION_ID = "55555555-5555-4555-8555-555555555555";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUB_A = "33333333-3333-4333-8333-333333333333";
const SUB_B = "44444444-4444-4444-8444-444444444444";

const emitEventMock = vi.hoisted(() => vi.fn(async () => "workflow-event-id"));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEventMock(...(args as [])),
}));

const mockCreateAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => mockCreateAdminClient(),
}));

function adminClientForSuccessfulCompletion() {
    return {
        from(table: string) {
            if (table === "workflow_events") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                contains: () => ({
                                    maybeSingle: async () => ({ data: null, error: null }),
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
                                        id: PACKET_SESSION_ID,
                                        org_id: ORG_ID,
                                        packet_definition_id: "66666666-6666-4666-8666-666666666666",
                                        started_via_public_link_id: LINK_ID,
                                        status: "completed",
                                        completed_at: "2026-05-08T12:00:00.000Z",
                                        crm_snapshot: { person_id: "dddddddd-dddd-4ddd-9ddd-dddddddddddd" },
                                        launch_context: { form_context_mode: "packet" },
                                        shared_values: { child_first_name: "Sam" },
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "form_packet_session_items") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: () =>
                                    Promise.resolve({
                                        data: [
                                            {
                                                id: "item-1",
                                                sequence_index: 0,
                                                status: "submitted",
                                                form_submission_id: SUB_A,
                                            },
                                            {
                                                id: "item-2",
                                                sequence_index: 1,
                                                status: "submitted",
                                                form_submission_id: SUB_B,
                                            },
                                        ],
                                        error: null,
                                    }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

describe("emitFormPacketCompletedSafe", () => {
    beforeEach(() => {
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
        emitEventMock.mockClear();
        mockCreateAdminClient.mockReset();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("emits form_packet_completed once with CRM snapshot and submission ids", async () => {
        mockCreateAdminClient.mockReturnValue(adminClientForSuccessfulCompletion());

        const r = await emitFormPacketCompletedSafe(ORG_ID, PACKET_SESSION_ID);
        expect(r.error).toBeNull();
        expect(emitEventMock).toHaveBeenCalledTimes(1);

        const calls = emitEventMock.mock.calls as unknown as [
            [
                {
                    event_type: string;
                    entity_type: string;
                    entity_id: string;
                    payload: Record<string, unknown>;
                },
            ],
        ];
        expect(calls.length).toBeGreaterThan(0);
        const arg = calls[0]![0];
        expect(arg.event_type).toBe("form_packet_completed");
        expect(arg.entity_type).toBe("form_packet_sessions");
        expect(arg.entity_id).toBe(PACKET_SESSION_ID);
        expect(arg.payload.org_id).toBe(ORG_ID);
        expect(arg.payload.packet_session_id).toBe(PACKET_SESSION_ID);
        expect(arg.payload.public_link_id).toBe(LINK_ID);
        expect(arg.payload.final_status).toBe("completed");
        expect(arg.payload.completed_item_count).toBe(2);
        expect(arg.payload.total_item_count).toBe(2);
        expect(arg.payload.related_submission_ids).toEqual([SUB_A, SUB_B]);
        expect(arg.payload.shared_value_top_level_keys).toEqual(["child_first_name"]);
        expect(arg.payload.crm_snapshot).toEqual({ person_id: "dddddddd-dddd-4ddd-9ddd-dddddddddddd" });
        expect(arg.payload.launch_context).toEqual({ form_context_mode: "packet" });
    });

    it("does not emit when an event already exists for the packet session", async () => {
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "workflow_events") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    contains: () => ({
                                        maybeSingle: async () => ({
                                            data: { id: "existing-completion-event" },
                                            error: null,
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        });

        const r = await emitFormPacketCompletedSafe(ORG_ID, PACKET_SESSION_ID);
        expect(r.error).toBeNull();
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("second emit is skipped after idempotent guard sees first insert", async () => {
        let dupReturned: Record<string, unknown> | null = null;
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "workflow_events") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    contains: () => ({
                                        maybeSingle: async () => ({
                                            data: dupReturned,
                                            error: null,
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "form_packet_sessions") {
                    return adminClientForSuccessfulCompletion().from("form_packet_sessions");
                }
                if (table === "form_packet_session_items") {
                    return adminClientForSuccessfulCompletion().from("form_packet_session_items");
                }
                throw new Error(`unexpected table ${table}`);
            },
        });

        dupReturned = null;
        await emitFormPacketCompletedSafe(ORG_ID, PACKET_SESSION_ID);
        expect(emitEventMock).toHaveBeenCalledTimes(1);

        dupReturned = { id: "recorded-by-first-run" };
        await emitFormPacketCompletedSafe(ORG_ID, PACKET_SESSION_ID);
        expect(emitEventMock).toHaveBeenCalledTimes(1);
    });
});
