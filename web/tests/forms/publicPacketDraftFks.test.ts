import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as submissionsPost } from "@/app/api/public/forms/[token]/submissions/route";

const validSchema = {
    schema_version: 1 as const,
    title: "Public",
    sections: [{ id: "s1", field_ids: ["a"] }],
    fields: [{ id: "a", type: "text" as const, label: "A" }],
};

const PERSON_FROM_SNAPSHOT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_FROM_SNAPSHOT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const mockResolveEmbed = vi.fn();

const { lastInsertRef } = vi.hoisted(() => ({
    lastInsertRef: { current: null as Record<string, unknown> | null },
}));

vi.mock("@/lib/public/forms/resolvePublicFormEmbedContext", () => ({
    resolvePublicFormEmbedContext: (...args: unknown[]) => mockResolveEmbed(...args),
}));

vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
            if (table === "form_packet_sessions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        shared_values: {},
                                        crm_snapshot: {
                                            person_id: PERSON_FROM_SNAPSHOT,
                                            customer_id: CUSTOMER_FROM_SNAPSHOT,
                                            customer_member_id: null,
                                            opportunity_id: null,
                                        },
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
                                maybeSingle: async () => ({
                                    data: { form_submission_id: null },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                    update: () => ({
                        eq: () => ({
                            eq: async () => ({ error: null }),
                        }),
                    }),
                };
            }
            if (table === "form_submissions") {
                return {
                    insert: (row: Record<string, unknown>) => {
                        lastInsertRef.current = row;
                        return {
                            select: () => ({
                                single: async () => ({
                                    data: {
                                        id: "33333333-3333-4333-8333-333333333333",
                                        status: "draft",
                                        payload: row.payload,
                                        form_definition_version_id: row.form_definition_version_id,
                                        person_id: row.person_id,
                                        customer_id: row.customer_id,
                                        customer_member_id: row.customer_member_id,
                                        opportunity_id: row.opportunity_id,
                                    },
                                    error: null,
                                }),
                            }),
                        };
                    },
                };
            }
            return {};
        }),
    })),
}));

function packetEmbedResolved() {
    return {
        ok: true as const,
        value: {
            linkId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            orgId: "11111111-1111-4111-8111-111111111111",
            formDefinitionId: "44444444-4444-4444-8444-444444444444",
            formDefinitionVersionId: "22222222-2222-4222-8222-222222222222",
            schemaJson: validSchema,
            pdfMappingJson: null,
            expiresAt: null,
            allowedEmbedOrigins: [] as string[],
            linkMetadata: {
                form_context_mode: "packet",
                packet_definition_id: "66666666-6666-4666-8666-666666666666",
            },
            formKey: "k",
            formName: "N",
            formKind: "center",
            packetTerminal: false,
            packet: {
                packet_session_id: "55555555-5555-4555-8555-555555555555",
                packet_definition_id: "66666666-6666-4666-8666-666666666666",
                packet_name: "Demo packet",
                current_sequence_index: 0,
                total_steps: 2,
                current_session_item_id: "77777777-7777-4777-8777-777777777777",
            },
        },
    };
}

describe("public packet POST submissions CRM FK continuity", () => {
    beforeEach(() => {
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
        lastInsertRef.current = null;
        mockResolveEmbed.mockResolvedValue(packetEmbedResolved());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("seeds draft FKs from session crm_snapshot for cold packet links", async () => {
        const res = await submissionsPost(
            new NextRequest("http://localhost/x", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: "http://localhost" },
                body: JSON.stringify({ payload: { values: { a: "x" } } }),
            }),
            { params: Promise.resolve({ token: "t" }) }
        );
        expect(res.status).toBe(201);
        expect(lastInsertRef.current?.person_id).toBe(PERSON_FROM_SNAPSHOT);
        expect(lastInsertRef.current?.customer_id).toBe(CUSTOMER_FROM_SNAPSHOT);
        const body = (await res.json()) as { ok: boolean; data?: { person_id?: string | null } };
        expect(body.ok).toBe(true);
        expect(body.data?.person_id).toBe(PERSON_FROM_SNAPSHOT);
    });

    it("does not let client payload.meta affect submission CRM FK columns", async () => {
        await submissionsPost(
            new NextRequest("http://localhost/x", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: "http://localhost" },
                body: JSON.stringify({
                    payload: {
                        values: { a: "x" },
                        meta: { person_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", forged_linkage: true },
                    },
                }),
            }),
            { params: Promise.resolve({ token: "t" }) }
        );
        expect(lastInsertRef.current?.person_id).toBe(PERSON_FROM_SNAPSHOT);
        expect(lastInsertRef.current?.customer_id).toBe(CUSTOMER_FROM_SNAPSHOT);
    });
});
