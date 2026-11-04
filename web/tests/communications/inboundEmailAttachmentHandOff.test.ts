/**
 * D10 — the Communications call site: a persisted, owned inbound email hands its attachments to Documents.
 *
 * Over the ingestion suite's PostgREST-shaped store (copied from inboundEmailObserveOnly.test.ts). What is proven:
 *   - the hand-off runs only for a message this ingestion persisted under its owning organization, and again on a
 *     resolved redelivery (the retry path), never for an unowned or cross-organization-ambiguous email;
 *   - a hand-off that throws changes nothing ingestion produces (differential, field for field);
 *   - the DEFAULT wiring is the production one: no content fetcher, no malware scanner — every attachment is held before
 *     a byte is read, and no document, storage object, case or source is written.
 * Not proven here: a provider attachment-content API (none exists in the repository), a scanner, or any database.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ingestResendInboundEmail,
    type InboundEmailIngestionDeps,
} from "@/lib/communications/email/inboundEmailIngestion";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";
import {
    fileInboundAttachmentsForPersistedMessage,
    makeInboundAttachmentFilingDeps,
    type InboundAttachmentHookResult,
} from "@/lib/documents/inbound/inboundAttachmentHook";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const REL = "55555555-5555-4555-8555-555555555555";

const DIRECTOR = "kelly@northwind.example";
const PARENT = "parent@example.invalid";
const AT = "2026-08-18T10:00:00.000Z";

const OBSERVATIONS = "communication_ingress_eligibility_observations";

type Row = Record<string, unknown>;

/**
 * PostgREST-shaped store, extended from the ingestion suite's with the tables the
 * eligibility loader reads.
 *
 * `failTables` is the point of the harness: it makes a chosen table's writes throw, which
 * is how "the gate blew up" is expressed without mocking the module under test.
 */
function makeStore(seed: Partial<Record<string, Row[]>> = {}, failTables: string[] = []) {
    const tables: Record<string, Row[]> = {
        communication_inbound_ingress: [],
        communication_provider_bindings: [],
        communication_ingress_routes: [],
        communication_messages: [],
        communication_threads: [],
        persons: [],
        workflow_events: [],
        org_settings: [],
        person_child_relationships: [],
        person_child_relationship_roles: [],
        child_enrollment_agreements: [],
        employments: [],
        opportunity_persons: [],
        opportunities: [],
        [OBSERVATIONS]: [],
        ...JSON.parse(JSON.stringify(seed)),
    };
    let seq = 0;
    const nextId = (p: string) => `${p}-${++seq}`;

    function client(): SupabaseClient {
        return {
            from(table: string) {
                if (!tables[table]) tables[table] = [];
                const rows = () => tables[table]!;
                const filters: Array<(r: Row) => boolean> = [];
                let pendingInsert: Row | null = null;
                let pendingUpdate: Row | null = null;

                const apply = () => rows().filter((r) => filters.every((f) => f(r)));

                const result = () => {
                    if (failTables.includes(table)) throw new Error(`store unavailable: ${table}`);
                    if (pendingInsert) {
                        if (table === "communication_inbound_ingress") {
                            const dup = rows().some(
                                (r) =>
                                    r.provider === pendingInsert!.provider &&
                                    r.channel === pendingInsert!.channel &&
                                    r.provider_message_id === pendingInsert!.provider_message_id
                            );
                            if (dup) return { data: null, error: { code: "23505" } };
                        }
                        if (table === "communication_messages" && pendingInsert.direction === "inbound") {
                            const dup = rows().some(
                                (r) =>
                                    r.org_id === pendingInsert!.org_id &&
                                    r.provider === pendingInsert!.provider &&
                                    r.channel === pendingInsert!.channel &&
                                    r.direction === "inbound" &&
                                    r.provider_message_id === pendingInsert!.provider_message_id
                            );
                            if (dup) return { data: null, error: { code: "23505" } };
                        }
                        const row = { id: nextId(table), ...pendingInsert };
                        rows().push(row);
                        return { data: row, error: null };
                    }
                    if (pendingUpdate) {
                        for (const r of apply()) Object.assign(r, pendingUpdate);
                        return { data: null, error: null };
                    }
                    return { data: apply(), error: null };
                };

                const builder: Record<string, unknown> = {
                    insert(v: Row) {
                        pendingInsert = v;
                        return builder;
                    },
                    update(v: Row) {
                        pendingUpdate = v;
                        return builder;
                    },
                    select: () => builder,
                    eq(col: string, val: unknown) {
                        filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
                        return builder;
                    },
                    in(col: string, vals: unknown[]) {
                        filters.push((r) => vals.map(String).includes(String(r[col] ?? "")));
                        return builder;
                    },
                    ilike(col: string, val: string) {
                        filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
                        return builder;
                    },
                    or(expr: string) {
                        filters.push((r) => {
                            const from = String(r.from_address ?? "");
                            const to = String(r.to_address ?? "");
                            return expr.includes(from) && expr.includes(to);
                        });
                        return builder;
                    },
                    limit: () => builder,
                    maybeSingle() {
                        const r = result();
                        if (r.error) return Promise.resolve(r);
                        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
                        return Promise.resolve({ data: d, error: null });
                    },
                    then(f: (v: unknown) => unknown) {
                        return Promise.resolve(result()).then(f);
                    },
                };
                return builder;
            },
        } as unknown as SupabaseClient;
    }

    return { tables, client };
}

function binding(over: Row = {}): Row {
    return {
        id: "bind-director",
        org_id: ORG_A,
        channel: "email",
        provider: "resend",
        status: "active",
        inbound_address: DIRECTOR,
        intake_role: "conversation",
        intake_purpose_key: null,
        location_id: null,
        ...over,
    };
}

function event(over: Row = {}) {
    return normalizeResendReceivedEvent(
        {
            email_id: "resend-observe-1",
            created_at: AT,
            from: PARENT,
            to: [DIRECTOR],
            cc: [],
            bcc: [],
            received_for: [],
            message_id: "<parent-1@mail.example>",
            subject: "Field trip form and a bank statement",
            attachments: [],
            ...over,
        },
        { receivedAtFallback: AT }
    )!;
}

function deps(client: SupabaseClient, headers: Record<string, string> = {}): InboundEmailIngestionDeps {
    return {
        supabase: client,
        retrieve: async () => ({
            ok: true,
            payload: {
                text: "Please see the attached form. Account number 1234-5678.",
                html: null,
                html_format: null,
                headers,
            },
        }),
        now: () => AT,
    };
}

const guardianSeed = {
    communication_provider_bindings: [binding()],
    persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
    person_child_relationships: [{ id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD }],
    person_child_relationship_roles: [{ id: "role-1", org_id: ORG_A, relationship_id: REL, role_key: "guardian", is_active: true }],
    child_enrollment_agreements: [{ id: "cea-1", org_id: ORG_A, customer_member_id: CHILD, status: "active" }],
};

const ATTACHMENTS = [
    { id: "att-1", filename: "immunizations.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 4000 },
    { id: "att-2", filename: "logo.png", content_type: "image/png", content_disposition: "inline", size: 300 },
];

function recording(throwWith?: Error) {
    const calls: Array<{ orgId: string; messageId: string }> = [];
    const fileAttachments = async (ref: { orgId: string; messageId: string }) => {
        calls.push(ref);
        if (throwWith) throw throwWith;
    };
    return { calls, fileAttachments };
}

const DOCUMENT_SIDE = ["documents", "processing_cases", "processing_case_sources"];

describe("the call site: owned and persisted only", () => {
    it("a persisted owned email with attachments hands off exactly once, with its organization and message id", async () => {
        const store = makeStore(guardianSeed);
        const rec = recording();
        const outcome = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), { ...deps(store.client()), fileAttachments: rec.fileAttachments });
        expect(outcome.status).toBe("persisted");
        const messageId = (outcome as { messageId: string }).messageId;
        expect(rec.calls).toEqual([{ orgId: ORG_A, messageId }]);
        expect(store.tables.communication_messages).toHaveLength(1);
    });

    it("no attachments: no hand-off", async () => {
        const store = makeStore(guardianSeed);
        const rec = recording();
        const outcome = await ingestResendInboundEmail(event(), { ...deps(store.client()), fileAttachments: rec.fileAttachments });
        expect(outcome.status).toBe("persisted");
        expect(rec.calls).toEqual([]);
    });

    it("a redelivery of the resolved email hands off again (the retry path) and persists nothing new", async () => {
        const store = makeStore(guardianSeed);
        const rec = recording();
        const d = { ...deps(store.client()), fileAttachments: rec.fileAttachments };
        const first = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), d);
        const second = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), d);
        const messageId = (first as { messageId: string }).messageId;
        expect(second).toEqual({ status: "duplicate", messageId });
        expect(rec.calls).toEqual([{ orgId: ORG_A, messageId }, { orgId: ORG_A, messageId }]);
        expect(store.tables.communication_messages).toHaveLength(1);
        expect(store.tables.communication_inbound_ingress).toHaveLength(1);
    });

    it("unowned (no binding) and cross-organization-ambiguous emails are quarantined and never handed off", async () => {
        const unowned = makeStore({});
        const rec1 = recording();
        expect(await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), { ...deps(unowned.client()), fileAttachments: rec1.fileAttachments })).toEqual({
            status: "quarantined",
            disposition: "no_attributable_org",
        });
        expect(rec1.calls).toEqual([]);

        const OTHER_ADDR = "office@southwind.example";
        const ambiguous = makeStore({
            ...guardianSeed,
            communication_provider_bindings: [binding(), binding({ id: "bind-b", org_id: ORG_B, inbound_address: OTHER_ADDR })],
        });
        const rec2 = recording();
        const out = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS, to: [DIRECTOR, OTHER_ADDR] }), { ...deps(ambiguous.client()), fileAttachments: rec2.fileAttachments });
        expect(out).toEqual({ status: "quarantined", disposition: "cross_org_ambiguous" });
        expect(rec2.calls).toEqual([]);
        expect(ambiguous.tables.communication_messages).toHaveLength(0);
    });

    it("an unrecognised sender refused by admission is never handed off", async () => {
        const store = makeStore({ communication_provider_bindings: [binding()] });
        const rec = recording();
        const out = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS, from: "statements@bank.example", email_id: "resend-bank-1" }), { ...deps(store.client()), fileAttachments: rec.fileAttachments });
        expect(out).toEqual({ status: "quarantined", disposition: "ineligible_unrecognized_sender" });
        expect(rec.calls).toEqual([]);
    });
});

describe("isolation: a failing hand-off changes nothing ingestion produces", () => {
    it("byte-identical canonical state and outcome whether the hand-off succeeds or throws", async () => {
        const healthy = makeStore(guardianSeed);
        const broken = makeStore(guardianSeed);
        const a = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), { ...deps(healthy.client()), fileAttachments: recording().fileAttachments });
        const b = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), { ...deps(broken.client()), fileAttachments: recording(new Error("documents down")).fileAttachments });
        expect(a.status).toBe("persisted");
        expect(b).toEqual(a);
        for (const t of ["communication_messages", "communication_threads", "workflow_events", "communication_inbound_ingress", OBSERVATIONS]) {
            expect(broken.tables[t], t).toEqual(healthy.tables[t]);
        }
    });
});

describe("the default wiring is production: everything held before a byte is read", () => {
    it("without an injected hand-off, the real hook runs with no fetcher and no scanner; nothing is written on the Documents side", async () => {
        const store = makeStore(guardianSeed);
        const outcome = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), deps(store.client()));
        expect(outcome.status).toBe("persisted");
        for (const t of DOCUMENT_SIDE) expect(store.tables[t] ?? [], t).toEqual([]);
        // The client has no storage API at all: any retrieval or upload attempt would have failed the hook, not passed.
    });

    it("with INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED on, the default call site still reads no byte while no scanner exists", async () => {
        vi.stubEnv("INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED", "true");
        const fetchSpy = vi.fn(async () => new Response("unexpected", { status: 599 }));
        vi.stubGlobal("fetch", fetchSpy);
        try {
            const store = makeStore(guardianSeed);
            const outcome = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), deps(store.client()));
            expect(outcome.status).toBe("persisted");
            expect(fetchSpy).not.toHaveBeenCalled();
            for (const t of [...DOCUMENT_SIDE, "communication_message_attachments"]) expect(store.tables[t] ?? [], t).toEqual([]);
        } finally {
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        }
    });

    it("the same production deps, observed directly: each attachment held with the missing capabilities named", async () => {
        const store = makeStore(guardianSeed);
        const results: InboundAttachmentHookResult[] = [];
        const client = store.client();
        const outcome = await ingestResendInboundEmail(event({ attachments: ATTACHMENTS }), {
            ...deps(client),
            fileAttachments: async (ref) => {
                results.push(await fileInboundAttachmentsForPersistedMessage({ supabase: client, filing: makeInboundAttachmentFilingDeps(client) }, ref));
            },
        });
        expect(outcome.status).toBe("persisted");
        expect(results).toHaveLength(1);
        const r = results[0]!;
        expect(r.status).toBe("filed");
        const outcomes = r.status === "filed" ? r.outcomes : [];
        expect(outcomes.map((o) => o.outcome)).toEqual(["held", "held"]);
        expect((outcomes[0] as { reasons: string[] }).reasons).toEqual(["storage_unavailable", "malware_scanning_unavailable"]);
        expect((outcomes[1] as { reasons: string[] }).reasons).toContain("not_an_attachment");
        for (const t of DOCUMENT_SIDE) expect(store.tables[t] ?? [], t).toEqual([]);
    });

    it("the hook refuses an outbound row and another organization's message: nothing is filed", async () => {
        const store = makeStore({
            communication_messages: [
                { id: "msg-out", org_id: ORG_A, direction: "outbound", channel: "email", metadata: { attachments: ATTACHMENTS } },
                { id: "msg-b", org_id: ORG_B, direction: "inbound", channel: "email", metadata: { attachments: ATTACHMENTS } },
            ],
        });
        const client = store.client();
        const filing = makeInboundAttachmentFilingDeps(client);
        expect(await fileInboundAttachmentsForPersistedMessage({ supabase: client, filing }, { orgId: ORG_A, messageId: "msg-out" })).toEqual({ status: "message_not_found" });
        expect(await fileInboundAttachmentsForPersistedMessage({ supabase: client, filing }, { orgId: ORG_A, messageId: "msg-b" })).toEqual({ status: "message_not_found" });
    });
});
