/**
 * The whole inbound email chain, exercised end to end.
 *
 * Receipt -> ownership -> retrieval -> correlation -> persistence, driven through
 * `ingestResendInboundEmail` over a fake PostgREST-shaped store. The point is the
 * COMPOSITION: every defect this guards against — a redelivery becoming two
 * emails, a foreign Message-ID crossing a tenant, a retrieval failure leaving a
 * half-message, an Activity firing twice — lives in how the steps fit together,
 * not in any one of them.
 */

import { describe, expect, it } from "vitest";

import {
    ingestResendInboundEmail,
    type InboundEmailIngestionDeps,
} from "@/lib/communications/email/inboundEmailIngestion";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const OUT_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OUT_FOREIGN = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const THREAD_A = "cccccccc-3333-4333-8333-cccccccccccc";
const THREAD_FOREIGN = "dddddddd-4444-4444-8444-dddddddddddd";

const RECEIVING = "hello@northwind.example";
const PARENT = "parent@example.invalid";
const AT = "2026-08-11T10:00:00.000Z";

type Row = Record<string, unknown>;

/** Minimal PostgREST-shaped store covering the operators the chain uses. */
function makeStore(seed: Partial<Record<string, Row[]>> = {}) {
    const tables: Record<string, Row[]> = {
        communication_inbound_ingress: [],
        communication_provider_bindings: [],
        communication_messages: [],
        communication_threads: [],
        persons: [],
        workflow_events: [],
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
                    if (pendingInsert) {
                        // Unique constraints the real schema enforces.
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
                        // Only the endpoint-provenance shape is used; match either direction.
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

/**
 * An ACQUISITION identity, deliberately.
 *
 * These cases certify ownership, correlation, exactly-once and field storage — none of
 * which depend on what an address is FOR. Since the runtime began refusing unrecognised
 * senders at `conversation` identities, a fixture at that role would make every one of them
 * a test of admission instead of the thing it was written for. An acquisition identity
 * admits unknown senders by design (that is the whole point of the role), so these keep
 * measuring what they always measured. Admission itself is certified separately, against
 * a conversation identity, in `conversationIdentityAdmission.test.ts`.
 */
function activeBinding(over: Row = {}): Row {
    return {
        id: "bind-a",
        org_id: ORG_A,
        channel: "email",
        provider: "resend",
        status: "active",
        inbound_address: RECEIVING,
        location_id: null,
        intake_role: "acquisition",
        ...over,
    };
}

function event(over: Row = {}) {
    return normalizeResendReceivedEvent(
        {
            email_id: "resend-inbound-1",
            created_at: AT,
            from: PARENT,
            to: [RECEIVING],
            cc: [],
            bcc: [],
            received_for: [],
            message_id: "<parent-1@mail.example>",
            subject: "Re: Enrollment paperwork",
            attachments: [],
            ...over,
        },
        { receivedAtFallback: AT }
    )!;
}

function deps(store: ReturnType<typeof makeStore>, retrieved: unknown, opts: { fail?: "retryable" | "permanent" } = {}) {
    const d: InboundEmailIngestionDeps = {
        supabase: store.client(),
        now: () => AT,
        retrieve: async () => {
            if (opts.fail === "retryable") return { ok: false, retryable: true, reason: "provider_503" };
            if (opts.fail === "permanent") return { ok: false, retryable: false, reason: "provider_404" };
            return { ok: true, payload: retrieved };
        },
    };
    return d;
}

const RETRIEVED = (headers: Row = {}) => ({
    text: "Yes, Thursday works.",
    html: "<p>Yes, Thursday works.</p>",
    html_format: "data_uri",
    headers: { "message-id": "<parent-1@mail.example>", ...headers },
});

describe("ownership decides before anything else", () => {
    it("persists into the owning organization", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        expect(got.status).toBe("persisted");
        expect(got.status === "persisted" && got.orgId).toBe(ORG_A);
        expect(store.tables.communication_messages).toHaveLength(1);
        expect(store.tables.communication_messages[0]!.channel).toBe("email");
        expect(store.tables.communication_messages[0]!.direction).toBe("inbound");
    });

    it("uses received_for when forwarding changed the visible recipient", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        const got = await ingestResendInboundEmail(
            event({ to: ["someone-else@elsewhere.example"], received_for: [RECEIVING] }),
            deps(store, RETRIEVED())
        );
        expect(got.status).toBe("persisted");
        expect(store.tables.communication_messages[0]!.to_address).toBe(RECEIVING);
    });

    it("quarantines a disabled binding rather than delivering", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding({ status: "disabled" })] });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        expect(got).toEqual({ status: "quarantined", disposition: "no_attributable_org" });
        expect(store.tables.communication_messages).toHaveLength(0);
        expect(store.tables.communication_inbound_ingress[0]!.routing_disposition).toBe("no_attributable_org");
    });

    it("quarantines a pending_verification binding", async () => {
        const store = makeStore({
            communication_provider_bindings: [activeBinding({ status: "pending_verification" })],
        });
        expect((await ingestResendInboundEmail(event(), deps(store, RETRIEVED()))).status).toBe("quarantined");
    });

    it("quarantines an unknown destination", async () => {
        const store = makeStore({ communication_provider_bindings: [] });
        expect((await ingestResendInboundEmail(event(), deps(store, RETRIEVED()))).status).toBe("quarantined");
    });

    it("never spends a provider call on a message no tenant owns", async () => {
        const store = makeStore({ communication_provider_bindings: [] });
        let retrieved = 0;
        await ingestResendInboundEmail(event(), {
            supabase: store.client(),
            now: () => AT,
            retrieve: async () => {
                retrieved++;
                return { ok: true, payload: RETRIEVED() };
            },
        });
        expect(retrieved).toBe(0);
    });
});

describe("correlation, strictly inside the owning tenant", () => {
    const seeded = () => ({
        communication_provider_bindings: [activeBinding()],
        communication_messages: [
            { id: OUT_A, org_id: ORG_A, thread_id: THREAD_A, direction: "outbound", channel: "email" },
            { id: OUT_FOREIGN, org_id: ORG_B, thread_id: THREAD_FOREIGN, direction: "outbound", channel: "email" },
        ],
    });

    it("In-Reply-To resolves the exact thread", async () => {
        const store = makeStore(seeded());
        const got = await ingestResendInboundEmail(
            event(),
            deps(store, RETRIEVED({ "in-reply-to": `<alloy.${OUT_A}@northwind.example>` }))
        );
        expect(got.status === "persisted" && got.threadId).toBe(THREAD_A);
        expect(got.status === "persisted" && got.method).toBe("in_reply_to");
    });

    it("a valid Alloy id belonging to ANOTHER organization is ignored", async () => {
        // The lookup is org-scoped, so it finds nothing and the email lands on its
        // own conversation instead of the foreign one.
        const store = makeStore(seeded());
        const got = await ingestResendInboundEmail(
            event(),
            deps(store, RETRIEVED({ "in-reply-to": `<alloy.${OUT_FOREIGN}@northwind.example>` }))
        );
        expect(got.status).toBe("persisted");
        expect(got.status === "persisted" && got.threadId).not.toBe(THREAD_FOREIGN);
        expect(got.status === "persisted" && got.method).not.toBe("in_reply_to");
    });

    it("falls back to the nearest References ancestor", async () => {
        const store = makeStore(seeded());
        const got = await ingestResendInboundEmail(
            event(),
            deps(
                store,
                RETRIEVED({ references: `<x@foreign.example> <alloy.${OUT_A}@northwind.example>` })
            )
        );
        expect(got.status === "persisted" && got.threadId).toBe(THREAD_A);
        expect(got.status === "persisted" && got.method).toBe("references");
    });

    it("ignores a forged Alloy-shaped id", async () => {
        const store = makeStore(seeded());
        const got = await ingestResendInboundEmail(
            event(),
            deps(store, RETRIEVED({ "in-reply-to": `<xxxxxx${OUT_A}@attacker.example>` }))
        );
        expect(got.status === "persisted" && got.method).not.toBe("in_reply_to");
    });

    it("ignores an unknown UUID and a malformed header", async () => {
        for (const header of ["<alloy.99999999-9999-4999-8999-999999999999@x.example>", "<garbage", ""]) {
            const store = makeStore(seeded());
            const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED({ "in-reply-to": header })));
            expect(got.status).toBe("persisted");
            expect(got.status === "persisted" && got.method).not.toBe("in_reply_to");
        }
    });

    it("correlates regardless of the domain the id was minted under", async () => {
        const store = makeStore(seeded());
        const got = await ingestResendInboundEmail(
            event({ subject: "completely different subject" }),
            deps(store, RETRIEVED({ "in-reply-to": `<alloy.${OUT_A}@a-domain-we-no-longer-use.example>` }))
        );
        // Subject changed AND the domain is historical; neither matters.
        expect(got.status === "persisted" && got.threadId).toBe(THREAD_A);
    });
});

describe("identity follows the SMS rule", () => {
    it("resolves a single Person by address", async () => {
        const store = makeStore({
            communication_provider_bindings: [activeBinding()],
            persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
        });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        expect(got.status === "persisted" && got.identified).toBe(true);
        expect(store.tables.communication_threads[0]!.primary_entity_type).toBe("persons");
    });

    it("asserts no Person for a shared household address", async () => {
        const store = makeStore({
            communication_provider_bindings: [activeBinding()],
            persons: [
                { id: PERSON, org_id: ORG_A, email: PARENT },
                { id: "44444444-4444-4444-8444-444444444444", org_id: ORG_A, email: PARENT },
            ],
        });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        expect(got.status === "persisted" && got.identified).toBe(false);
        expect(got.status === "persisted" && got.ambiguous).toBe(true);
        expect(store.tables.communication_threads[0]!.primary_entity_type).toBe("communications_unknown");
        expect(store.tables.communication_threads[0]!.attention_state).toBe("needs_routing_resolution");
    });

    it("anchors an unknown sender to the shared surrogate convention", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        expect(got.status === "persisted" && got.identified).toBe(false);
        expect(store.tables.communication_threads[0]!.primary_entity_type).toBe("communications_unknown");
    });
});

describe("exactly once, across redelivery and retry", () => {
    it("a duplicate webhook produces one email, one Activity, one thread", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        const first = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        const second = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));

        expect(first.status).toBe("persisted");
        expect(second.status).toBe("duplicate");
        expect(store.tables.communication_messages).toHaveLength(1);
        expect(store.tables.workflow_events).toHaveLength(1);
        expect(store.tables.communication_threads).toHaveLength(1);
        expect(store.tables.communication_inbound_ingress).toHaveLength(1);
    });

    it("a transient retrieval failure leaves the receipt retryable and writes no message", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED(), { fail: "retryable" }));
        expect(got.status).toBe("retrieval_pending");
        expect(store.tables.communication_messages).toHaveLength(0);
        expect(store.tables.workflow_events).toHaveLength(0);
        expect(store.tables.communication_inbound_ingress[0]!.routing_disposition).toBe("retrieval_pending");
    });

    it("the retry after a transient failure completes without duplicating", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        await ingestResendInboundEmail(event(), deps(store, RETRIEVED(), { fail: "retryable" }));
        const retry = await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));

        expect(retry.status).toBe("persisted");
        expect(store.tables.communication_messages).toHaveLength(1);
        expect(store.tables.workflow_events).toHaveLength(1);
        expect(store.tables.communication_inbound_ingress).toHaveLength(1);
    });

    it("a permanently unreadable message stops waiting and is recorded, not lost", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        const got = await ingestResendInboundEmail(event(), deps(store, RETRIEVED(), { fail: "permanent" }));
        expect(got.status).toBe("ignored");
        expect(store.tables.communication_inbound_ingress).toHaveLength(1);
        expect(String(store.tables.communication_inbound_ingress[0]!.resolution_note)).toContain(
            "retrieval_permanent_failure"
        );
    });
});

describe("canonical email truth", () => {
    it("stores the product-relevant fields including RFC threading", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        await ingestResendInboundEmail(
            event(),
            deps(
                store,
                RETRIEVED({ "in-reply-to": "<alloy.aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa@x.example>", references: "<a@b>" })
            )
        );
        const m = store.tables.communication_messages[0]!;
        expect(m.subject).toBe("Re: Enrollment paperwork");
        expect(m.body).toBe("Yes, Thursday works.");
        expect(m.body_format).toBe("plain");
        expect(m.email_message_id).toBe("<parent-1@mail.example>");
        expect(m.email_in_reply_to).toContain("alloy.");
        expect(m.email_references).toBe("<a@b>");
        expect(m.from_address).toBe(PARENT);
        expect(m.to_address).toBe(RECEIVING);
    });

    it("records attachment presence without storing anything", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        await ingestResendInboundEmail(
            event({
                attachments: [{ id: "att-1", filename: "immunisation.pdf", content_type: "application/pdf" }],
            }),
            deps(store, RETRIEVED())
        );
        const meta = store.tables.communication_messages[0]!.metadata as Record<string, unknown>;
        expect(meta.attachment_count).toBe(1);
        expect(String(meta.attachment_notice)).toContain("attachment support is not available yet");
    });

    it("keeps raw provider payload out of the message row", async () => {
        const store = makeStore({ communication_provider_bindings: [activeBinding()] });
        await ingestResendInboundEmail(event(), deps(store, RETRIEVED()));
        const serialized = JSON.stringify(store.tables.communication_messages[0]);
        expect(serialized).not.toContain("download_url");
        expect(serialized).not.toContain("return-path");
    });
});
