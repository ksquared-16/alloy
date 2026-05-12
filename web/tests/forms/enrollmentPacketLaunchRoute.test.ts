import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const PDEF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEM1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEM2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PERSON = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BIND = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const mintMock = vi.hoisted(() =>
    vi.fn(async (params: { body: Record<string, unknown> }) => {
        const sel = params.body.enrollment_selection as { customer_member_id?: string | null };
        const mid = sel?.customer_member_id ?? "house";
        const id =
            mid === "house" ?
                "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"
            : mid === MEM1 ? "aaaaaaaa-aaaa-4aaa-8aaa-000000000002"
            : "aaaaaaaa-aaaa-4aaa-8aaa-000000000003";
        return {
            ok: true as const,
            data: {
                id,
                plaintext_token: "t",
                embed_path: `/embed/${id}`,
                embed_url: `https://example.com/embed/${id}`,
                packet_definition_id: PDEF,
                first_step_sequence_index: 0,
            },
        };
    })
);

const resolveMock = vi.hoisted(() =>
    vi.fn(async (_sb: unknown, _org: string, _opp: string, raw: { customer_member_id?: string | null } | null | undefined) => ({
        ok: true as const,
        value: {
            selected_customer_member_id: raw?.customer_member_id ?? null,
            recipient_person_id: PERSON,
            delivery_intent: "copy_link" as const,
        },
    }))
);

const enqueueMock = vi.hoisted(() =>
    vi.fn(async () => ({
        communicationMessageId: "99999999-9999-4999-8999-999999999999",
        threadId: "88888888-8888-4888-8888-888888888888",
        skippedReason: null as string | null,
    }))
);

const emitSentMock = vi.hoisted(() => vi.fn(async () => ({ error: null as Error | null })));

const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/adminAuth", () => ({
    requireAdminOrOps: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(() =>
        Promise.resolve({ ok: true, orgId: ORG, userId: "33333333-3333-4333-8333-333333333333", role: "admin" })
    ),
    adminContextFailureResponse: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: vi.fn(() =>
        Promise.resolve({
            ok: true,
            userId: "33333333-3333-4333-8333-333333333333",
            orgId: ORG,
            roleKeys: ["admin"],
            permissionKeys: ["communications.send"],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        })
    ),
}));

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/admin/accessScope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/accessScope")>();
    return {
        ...actual,
        assertExistingOpportunityMutableInAdminScope: vi.fn(async () => true),
    };
});

vi.mock("@/lib/forms/packets/mintPacketPublicLinkForAdmin", () => ({
    mintPacketPublicLinkForAdmin: (params: { body: Record<string, unknown> }) => mintMock(params),
}));

vi.mock("@/lib/forms/packets/opportunityPacketLaunchValidation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/forms/packets/opportunityPacketLaunchValidation")>();
    return {
        ...actual,
        resolveOpportunityEnrollmentSelection: (
            sb: unknown,
            org: string,
            opp: string,
            raw: { customer_member_id?: string | null } | null | undefined
        ) => resolveMock(sb, org, opp, raw),
    };
});

vi.mock("@/lib/communications/communicationPermissions", () => ({
    COMMUNICATIONS_SEND_PERMISSION_KEY: "communications.send",
    assertCommunicationsSendAllowed: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/communications/canonicalOutboundEnqueue", () => ({
    enqueueCanonicalOutboundMessage: (...args: unknown[]) => enqueueMock(...(args as [])),
}));

vi.mock("@/lib/communications/drawerEmailRecipients", () => ({
    assertRecipientPersonEligibleForDrawerEmail: vi.fn(async () => true),
    getPersonEmailOrNull: vi.fn(async () => "guardian@example.com"),
}));

vi.mock("@/lib/communications/triggerBackendMessagesQueue", () => ({
    triggerBackendMessagesQueue: vi.fn(async () => {}),
}));

vi.mock("@/lib/forms/workflow/opportunityEnrollmentPacketProjections", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/forms/workflow/opportunityEnrollmentPacketProjections")>();
    return {
        ...actual,
        emitOpportunityEnrollmentPacketSentSafe: (...args: unknown[]) => emitSentMock(...(args as [])),
    };
});

import { POST } from "@/app/api/admin/opportunities/[id]/enrollment-packet-launch/route";

function jsonRequest(body: Record<string, unknown>) {
    return new NextRequest(`http://localhost/api/admin/opportunities/${OPP}/enrollment-packet-launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function supabaseFrom() {
    return {
        from(table: string) {
            if (table === "opportunities") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { name: "Spring tour", customer_id: "aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc", primary_person_id: PERSON },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "customer_members") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { first_name: "Sam", last_name: "Student", display_name: null },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "communication_provider_bindings") {
                return {
                    select: () => ({
                        eq: () => ({
                            order: async () => ({
                                data: [
                                    {
                                        id: BIND,
                                        channel: "email",
                                        scope: "org",
                                        location_id: null,
                                        display_label: "Primary",
                                        provider: "resend",
                                        status: "active",
                                        is_primary: true,
                                        secret_ref: "vault:email/primary",
                                        inbound_to_e164: null,
                                        config: {},
                                    },
                                ],
                                error: null,
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
                                maybeSingle: async () => ({
                                    data: {
                                        name: "Fall intake",
                                        metadata: {
                                            enrollment_email: {
                                                subject_template: "Custom: {{household_name}}",
                                                body_template: "Hello\n{{packet_links}}",
                                            },
                                        },
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "customers") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: { name: "Jones Family" }, error: null }),
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
                                maybeSingle: async () => ({ data: { first_name: "Pat", last_name: "Lee" }, error: null }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "organizations") {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { name: "Acme Org" }, error: null }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected supabase table ${table}`);
        },
    };
}

describe("POST /api/admin/opportunities/[id]/enrollment-packet-launch", () => {
    beforeEach(() => {
        mintMock.mockClear();
        resolveMock.mockClear();
        enqueueMock.mockClear();
        emitSentMock.mockClear();
        createAdminClientMock.mockReturnValue(supabaseFrom() as never);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("mints one household link when customer_member_ids is empty", async () => {
        const res = await POST(jsonRequest({ packet_definition_id: PDEF, recipient_person_id: null, customer_member_ids: [], delivery: "copy_only" }), {
            params: Promise.resolve({ id: OPP }),
        });
        expect(res.status).toBe(200);
        expect(mintMock).toHaveBeenCalledTimes(1);
        const first = mintMock.mock.calls[0]![0] as { body: Record<string, unknown> };
        const sel = first.body["enrollment_selection"] as { customer_member_id: string | null } | undefined;
        expect(sel?.customer_member_id ?? null).toBeNull();
        const j = (await res.json()) as { created_links: { customer_member_id: string | null }[] };
        expect(j.created_links).toHaveLength(1);
        expect(j.created_links[0]!.customer_member_id).toBeNull();
    });

    it("mints one link per selected child and preserves member ids in selection", async () => {
        const res = await POST(
            jsonRequest({
                packet_definition_id: PDEF,
                recipient_person_id: null,
                customer_member_ids: [MEM1, MEM2],
                delivery: "copy_only",
            }),
            { params: Promise.resolve({ id: OPP }) }
        );
        expect(res.status).toBe(200);
        expect(mintMock).toHaveBeenCalledTimes(2);
        const mids = mintMock.mock.calls.map((c) => {
            const b = c[0] as { body: Record<string, unknown> };
            return (b.body["enrollment_selection"] as { customer_member_id: string }).customer_member_id;
        });
        expect(mids.sort()).toEqual([MEM1, MEM2].sort());
        expect(resolveMock).toHaveBeenCalled();
        const j = (await res.json()) as { created_links: unknown[] };
        expect(j.created_links).toHaveLength(2);
    });

    it("enqueues Communications email with opportunity entity when delivery is send_email", async () => {
        const res = await POST(
            jsonRequest({
                packet_definition_id: PDEF,
                recipient_person_id: null,
                customer_member_ids: [MEM1],
                delivery: "send_email",
                email_subject: "Enrollment for {{household_name}}",
                email_body: "Hi {{recipient_name}},\n\n{{packet_links}}\n",
            }),
            { params: Promise.resolve({ id: OPP }) }
        );
        expect(res.status).toBe(200);
        expect(enqueueMock).toHaveBeenCalledTimes(1);
        const arg = (enqueueMock.mock.calls as unknown[][])[0]![0] as {
            primaryEntityType: string;
            primaryEntityId: string;
            metadata: Record<string, unknown>;
            bodyRaw: string;
            emailSubjectRaw: string | null;
        };
        expect(arg.primaryEntityType).toBe("opportunities");
        expect(arg.primaryEntityId).toBe(OPP);
        expect(arg.metadata.delivery_surface).toBe("enrollment_packet");
        expect(arg.metadata.opportunity_id).toBe(OPP);
        expect(arg.metadata.entity_type).toBeUndefined();
        expect(typeof arg.bodyRaw).toBe("string");
        expect(String(arg.bodyRaw)).toContain("https://example.com/embed/");
        expect(String(arg.emailSubjectRaw ?? "")).toContain("Jones Family");
        expect(arg.metadata.enrollment_packet_email_sent_subject).toBeDefined();
        expect(arg.metadata.enrollment_packet_email_sent_body).toBeDefined();
        expect(emitSentMock).toHaveBeenCalled();
        const j = (await res.json()) as { email: { ok: boolean } };
        expect(j.email.ok).toBe(true);
    });
});
