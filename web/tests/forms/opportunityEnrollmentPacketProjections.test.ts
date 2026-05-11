import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    OPPORTUNITY_ENROLLMENT_PACKET_CREATED,
    OPPORTUNITY_ENROLLMENT_PACKET_SENT,
    emitOpportunityEnrollmentPacketCreatedSafe,
    emitOpportunityEnrollmentPacketSentSafe,
    resolveOpportunityIdFromSessionSnapshotFields,
} from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const LINK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PDEF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEM1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const emitEventMock = vi.hoisted(() => vi.fn(async () => "workflow-event-id"));
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEventMock(...(args as [])),
}));

const mockCreateAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => mockCreateAdminClient(),
}));

describe("resolveOpportunityIdFromSessionSnapshotFields", () => {
    it("prefers crm_snapshot.opportunity_id", () => {
        expect(
            resolveOpportunityIdFromSessionSnapshotFields(
                { opportunity_id: OPP, customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
                { source_entity_type: "customer", source_entity_id: "dddddddd-dddd-4ddd-9ddd-dddddddddddd" }
            )
        ).toBe(OPP);
    });

    it("falls back to launch_context opportunity source", () => {
        expect(
            resolveOpportunityIdFromSessionSnapshotFields(
                {},
                { source_entity_type: "opportunity", source_entity_id: OPP }
            )
        ).toBe(OPP);
    });

    it("returns null when not an opportunity launch", () => {
        expect(
            resolveOpportunityIdFromSessionSnapshotFields(
                {},
                { source_entity_type: "customer", source_entity_id: "dddddddd-dddd-4ddd-9ddd-dddddddddddd" }
            )
        ).toBeNull();
    });
});

describe("emitOpportunityEnrollmentPacketCreatedSafe", () => {
    beforeEach(() => {
        emitEventMock.mockClear();
        mockCreateAdminClient.mockReset();
    });

    it("is idempotent when a matching projection already exists", async () => {
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "workflow_events") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        eq: () => ({
                                            contains: () => ({
                                                maybeSingle: async () => ({
                                                    data: { id: "existing-event" },
                                                    error: null,
                                                }),
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "form_packet_definitions") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { name: "Demo packet" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        });
        const r = await emitOpportunityEnrollmentPacketCreatedSafe({
            orgId: ORG,
            opportunityId: OPP,
            publicLinkId: LINK,
            packetDefinitionId: PDEF,
            linkMetadata: { delivery_intent: "copy_link", launch_surface: "crm_opportunity" },
        });
        expect(r.error).toBeNull();
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("emits once when no prior projection exists", async () => {
        let firstWorkflowQuery = true;
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "workflow_events") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        eq: () => ({
                                            contains: () => ({
                                                maybeSingle: async () => {
                                                    if (firstWorkflowQuery) {
                                                        firstWorkflowQuery = false;
                                                        return { data: null, error: null };
                                                    }
                                                    return { data: null, error: null };
                                                },
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "form_packet_definitions") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { name: "Demo packet" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        });
        const r = await emitOpportunityEnrollmentPacketCreatedSafe({
            orgId: ORG,
            opportunityId: OPP,
            publicLinkId: LINK,
            packetDefinitionId: PDEF,
            linkMetadata: {},
        });
        expect(r.error).toBeNull();
        const calls = emitEventMock.mock.calls as unknown[][];
        expect(calls.length).toBe(1);
        const arg = calls[0]![0] as {
            event_type: string;
            entity_type: string;
            entity_id: string;
            payload: Record<string, unknown>;
        };
        expect(arg.event_type).toBe(OPPORTUNITY_ENROLLMENT_PACKET_CREATED);
        expect(arg.entity_type).toBe("opportunities");
        expect(arg.entity_id).toBe(OPP);
        expect(arg.payload.public_link_id).toBe(LINK);
        expect(arg.payload.packet_definition_id).toBe(PDEF);
    });
});

describe("emitOpportunityEnrollmentPacketSentSafe", () => {
    beforeEach(() => {
        emitEventMock.mockClear();
        mockCreateAdminClient.mockReset();
    });

    it("is idempotent when a matching batch projection already exists", async () => {
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "workflow_events") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        eq: () => ({
                                            contains: () => ({
                                                maybeSingle: async () => ({
                                                    data: { id: "existing-sent" },
                                                    error: null,
                                                }),
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "form_packet_definitions") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { name: "Demo packet" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "persons") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { first_name: "Pat", last_name: "Lee" },
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
        const r = await emitOpportunityEnrollmentPacketSentSafe({
            orgId: ORG,
            opportunityId: OPP,
            packetDefinitionId: PDEF,
            formPublicLinkIds: [LINK, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"],
            recipientPersonId: "99999999-9999-4999-8999-999999999999",
            selectedCustomerMemberIds: [],
            communicationMessageId: "msg-1",
        });
        expect(r.error).toBeNull();
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("emits opportunity_enrollment_packet_sent once with batch key", async () => {
        let firstWorkflowQuery = true;
        mockCreateAdminClient.mockReturnValue({
            from(table: string) {
                if (table === "workflow_events") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        eq: () => ({
                                            contains: () => ({
                                                maybeSingle: async () => {
                                                    if (firstWorkflowQuery) {
                                                        firstWorkflowQuery = false;
                                                        return { data: null, error: null };
                                                    }
                                                    return { data: null, error: null };
                                                },
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "form_packet_definitions") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { name: "Demo packet" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "persons") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { first_name: "Pat", last_name: "Lee" },
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
        const linkB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
        const r = await emitOpportunityEnrollmentPacketSentSafe({
            orgId: ORG,
            opportunityId: OPP,
            packetDefinitionId: PDEF,
            formPublicLinkIds: [linkB, LINK],
            recipientPersonId: "99999999-9999-4999-8999-999999999999",
            selectedCustomerMemberIds: [MEM1],
            communicationMessageId: "msg-2",
        });
        expect(r.error).toBeNull();
        const calls = emitEventMock.mock.calls as unknown[][];
        expect(calls.length).toBe(1);
        const arg = calls[0]![0] as {
            event_type: string;
            entity_type: string;
            entity_id: string;
            payload: Record<string, unknown>;
        };
        expect(arg.event_type).toBe(OPPORTUNITY_ENROLLMENT_PACKET_SENT);
        expect(arg.entity_type).toBe("opportunities");
        expect(arg.entity_id).toBe(OPP);
        expect(arg.payload.form_public_link_batch_key).toBe(`${LINK},${linkB}`);
        expect(arg.payload.communication_message_id).toBe("msg-2");
    });
});
