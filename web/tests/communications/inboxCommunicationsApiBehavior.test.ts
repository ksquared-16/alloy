/**
 * A2 — what the operator-facing Communications API actually returns.
 *
 * These drive the real `listInboxThreads` (the function behind
 * GET /api/admin/inbox/threads) over a fake PostgREST-shaped client holding
 * canonical fixture rows, rather than asserting on the projection helpers in
 * isolation. The defects this slice is guarding against — a Person minted from
 * another row's data, a duplicate counted as unread, an address reaching the
 * wire — all live in how the pieces compose, so composition is what is tested.
 *
 * The fake answers `.from(table)` with fixture rows and applies the filters the
 * service uses. Any table the service reads that is not in the fixture set
 * throws, which is how "quarantined ingress is never queried" is proven rather
 * than assumed.
 */

import { describe, expect, it } from "vitest";

import { listInboxThreads } from "@/lib/communications/inboxThreadsService";
import { SUPERSEDED_DUPLICATE_KEY } from "@/lib/communications/supersededDuplicateMessages";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "99999999-9999-9999-9999-999999999999";
const USER = "22222222-2222-2222-2222-222222222222";

const JORDAN = "33333333-3333-3333-3333-333333333333";
const AMBIG_A = "44444444-4444-4444-4444-444444444444";
const AMBIG_B = "55555555-5555-5555-5555-555555555555";

const THREAD_RESOLVED = "aaaaaaaa-0000-0000-0000-00000000000a";
const THREAD_AMBIGUOUS = "aaaaaaaa-0000-0000-0000-00000000000b";
const THREAD_UNKNOWN = "aaaaaaaa-0000-0000-0000-00000000000c";

const JORDAN_PHONE = "+15551230001";
const AMBIG_PHONE = "+15551230002";
const UNKNOWN_PHONE = "+15551239999";

type Row = Record<string, unknown>;

/** Tables the inbox is allowed to read. Ingress is deliberately absent. */
const FIXTURES: Record<string, Row[]> = {
    communication_threads: [
        {
            id: THREAD_RESOLVED,
            org_id: ORG,
            channel: "sms",
            recipient_key: JORDAN_PHONE,
            primary_entity_type: "persons",
            primary_entity_id: JORDAN,
            created_at: "2026-08-10T09:00:00.000Z",
            updated_at: "2026-08-10T12:00:00.000Z",
            last_message_at: "2026-08-10T12:00:00.000Z",
            archived_at: null,
            attention_state: "needs_response",
            metadata: { inbound_resolution: "single_person_match", person_id: JORDAN },
        },
        {
            id: THREAD_AMBIGUOUS,
            org_id: ORG,
            channel: "sms",
            recipient_key: AMBIG_PHONE,
            primary_entity_type: "communications_unknown",
            primary_entity_id: "surrogate-ambiguous",
            created_at: "2026-08-10T09:00:00.000Z",
            updated_at: "2026-08-10T11:00:00.000Z",
            last_message_at: "2026-08-10T11:00:00.000Z",
            archived_at: null,
            attention_state: "needs_routing_resolution",
            metadata: {
                inbound_resolution: "ambiguous_sender",
                candidate_person_ids: [AMBIG_A, AMBIG_B],
                anchor: "surrogate_ambiguous_persons",
            },
        },
        {
            id: THREAD_UNKNOWN,
            org_id: ORG,
            channel: "sms",
            recipient_key: UNKNOWN_PHONE,
            primary_entity_type: "communications_unknown",
            primary_entity_id: "surrogate-unknown",
            created_at: "2026-08-10T09:00:00.000Z",
            updated_at: "2026-08-10T10:00:00.000Z",
            last_message_at: "2026-08-10T10:00:00.000Z",
            archived_at: null,
            attention_state: "needs_response",
            metadata: { inbound_resolution: "unknown_sender", anchor: "surrogate_phone" },
        },
        {
            id: "bbbbbbbb-0000-0000-0000-00000000000a",
            org_id: OTHER_ORG,
            channel: "sms",
            recipient_key: "+15550000000",
            primary_entity_type: "persons",
            primary_entity_id: "cccccccc-0000-0000-0000-00000000000a",
            created_at: "2026-08-10T09:00:00.000Z",
            updated_at: "2026-08-10T13:00:00.000Z",
            last_message_at: "2026-08-10T13:00:00.000Z",
            archived_at: null,
            attention_state: "needs_response",
            metadata: {},
        },
    ],
    communication_messages: [
        {
            id: "dddddddd-0000-0000-0000-000000000001",
            thread_id: THREAD_RESOLVED,
            org_id: ORG,
            direction: "outbound",
            channel: "sms",
            status: "delivered",
            body: "Hi Jordan — your tour is Thursday at 10.",
            created_at: "2026-08-10T11:00:00.000Z",
            metadata: {},
        },
        {
            id: "dddddddd-0000-0000-0000-000000000002",
            thread_id: THREAD_RESOLVED,
            org_id: ORG,
            direction: "inbound",
            channel: "sms",
            status: "received",
            body: "Thursday works, thank you!",
            created_at: "2026-08-10T12:00:00.000Z",
            metadata: {},
        },
        {
            // The same provider delivery recorded twice before inbound uniqueness
            // existed. Newest row on the thread, so it would win the preview.
            id: "dddddddd-0000-0000-0000-000000000003",
            thread_id: THREAD_RESOLVED,
            org_id: ORG,
            direction: "inbound",
            channel: "sms",
            status: "received",
            body: "Thursday works, thank you!",
            created_at: "2026-08-10T12:00:05.000Z",
            metadata: { [SUPERSEDED_DUPLICATE_KEY]: "SMdup" },
        },
        {
            id: "dddddddd-0000-0000-0000-000000000004",
            thread_id: THREAD_AMBIGUOUS,
            org_id: ORG,
            direction: "inbound",
            channel: "sms",
            status: "received",
            body: "Is the deposit due today?",
            created_at: "2026-08-10T11:00:00.000Z",
            metadata: {},
        },
        {
            id: "dddddddd-0000-0000-0000-000000000005",
            thread_id: THREAD_UNKNOWN,
            org_id: ORG,
            direction: "inbound",
            channel: "sms",
            status: "received",
            body: "Do you have openings for a 3 year old?",
            created_at: "2026-08-10T10:00:00.000Z",
            metadata: {},
        },
    ],
    communication_message_reads: [],
    communication_provider_bindings: [
        {
            id: "eeeeeeee-0000-0000-0000-000000000001",
            channel: "sms",
            scope: "org",
            location_id: null,
            display_label: "Main line",
            provider: "twilio",
            status: "active",
            is_primary: true,
            secret_ref: "cert",
            inbound_to_e164: "+15557654321",
            config: {},
            org_id: ORG,
        },
    ],
    persons: [
        {
            id: JORDAN,
            org_id: ORG,
            full_name: "Jordan Smith",
            first_name: "Jordan",
            last_name: "Smith",
            email: "jordan@example.com",
            phone: JORDAN_PHONE,
        },
        // Both share the ambiguous number. Present in the org, and therefore
        // reachable by the person-by-phone index the projection must not use.
        {
            id: AMBIG_A,
            org_id: ORG,
            full_name: "Alex Rivera",
            first_name: "Alex",
            last_name: "Rivera",
            email: "alex@example.com",
            phone: AMBIG_PHONE,
        },
        {
            id: AMBIG_B,
            org_id: ORG,
            full_name: "Sam Rivera",
            first_name: "Sam",
            last_name: "Rivera",
            email: "sam@example.com",
            phone: AMBIG_PHONE,
        },
    ],
};

/** Tables that exist but are empty for these fixtures. */
const EMPTY_TABLES = new Set([
    "opportunities",
    "jobs",
    "customers",
    "locations",
    "pipeline_stages",
    "opportunity_persons",
    "opportunity_customer_members",
    "customer_persons",
    "communication_scheduled_sends",
]);

const readTables: string[] = [];

type Filter = { op: "eq" | "in" | "is" | "not_is"; column: string; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
    return filters.every((f) => {
        const actual = row[f.column];
        if (f.op === "eq") return String(actual ?? "") === String(f.value ?? "");
        if (f.op === "in") return (f.value as unknown[]).map(String).includes(String(actual ?? ""));
        if (f.op === "is") return actual == null;
        if (f.op === "not_is") return actual != null;
        return true;
    });
}

function makeQuery(table: string) {
    const filters: Filter[] = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limit = Infinity;

    const rows = (): Row[] => {
        if (table in FIXTURES) return FIXTURES[table]!;
        if (EMPTY_TABLES.has(table)) return [];
        throw new Error(`Inbox read an unexpected table: ${table}`);
    };

    // Ordering is not decoration here: the service takes the FIRST row per thread
    // as the preview, so "newest first" is what makes the superseded-duplicate
    // exclusion meaningful. A fake that ignored order would pass either way.
    const sorted = (list: Row[]): Row[] => {
        if (orders.length === 0) return list;
        return [...list].sort((a, b) => {
            for (const o of orders) {
                const av = String(a[o.column] ?? "");
                const bv = String(b[o.column] ?? "");
                if (av === bv) continue;
                const cmp = av < bv ? -1 : 1;
                return o.ascending ? cmp : -cmp;
            }
            return 0;
        });
    };

    const result = () => ({
        data: sorted(rows().filter((r) => matches(r, filters))).slice(0, limit),
        error: null,
    });

    const builder: Record<string, unknown> = {
        select() {
            return builder;
        },
        eq(column: string, value: unknown) {
            filters.push({ op: "eq", column, value });
            return builder;
        },
        in(column: string, value: unknown[]) {
            filters.push({ op: "in", column, value });
            return builder;
        },
        is(column: string, _value: unknown) {
            filters.push({ op: "is", column, value: null });
            return builder;
        },
        not(column: string, _op: string, _value: unknown) {
            filters.push({ op: "not_is", column, value: null });
            return builder;
        },
        order(column: string, opts?: { ascending?: boolean }) {
            orders.push({ column, ascending: opts?.ascending !== false });
            return builder;
        },
        limit(n: number) {
            limit = n;
            return builder;
        },
        maybeSingle() {
            const r = result();
            return Promise.resolve({ data: r.data[0] ?? null, error: null });
        },
        then(onFulfilled: (v: { data: Row[]; error: null }) => unknown) {
            return Promise.resolve(result()).then(onFulfilled);
        },
    };
    return builder;
}

function fakeSupabase(): SupabaseClient {
    return {
        from(table: string) {
            readTables.push(table);
            return makeQuery(table);
        },
    } as unknown as SupabaseClient;
}

async function loadInbox() {
    readTables.length = 0;
    const result = await listInboxThreads({
        supabase: fakeSupabase(),
        orgId: ORG,
        userId: USER,
        folder: "inbox",
        limit: 50,
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
}

describe("A2 — Communications API: resolved sender", () => {
    it("shows the inbound SMS once, on the right Person, with body, time and channel", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_RESOLVED)!;

        expect(t.sender_identity_state).toBe("identified");
        expect(t.contact_display).toBe("Jordan Smith");
        expect(t.reply_person_id).toBe(JORDAN);
        expect(t.channel).toBe("sms");
        expect(t.routing_state).toBe("routed");
        expect(t.has_unread).toBe(true);
    });

    it("hides the superseded duplicate rather than showing the parent repeating themselves", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_RESOLVED)!;

        // The duplicate is the newest row on the thread. If it were included it
        // would be the preview, and its id would be its own unread item.
        expect(t.last_message_preview?.body).toBe("Thursday works, thank you!");
        expect(t.last_message_preview?.created_at).toBe("2026-08-10T12:00:00.000Z");
        expect(t.preview_lead).toBe("SMS · Thursday works, thank you!");
    });

    it("replies to a resolved sender by Person, carrying no address", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_RESOLVED)!;

        expect(t.can_reply).toBe(true);
        expect(t.reply_authority).toBe("person");
        expect(t.reply_display_label).toBe("Jordan Smith");
    });
});

describe("A2 — Communications API: same-org ambiguous routing", () => {
    it("keeps the conversation visible and says routing is unresolved in safe language", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_AMBIGUOUS)!;

        expect(t.routing_state).toBe("needs_routing_resolution");
        expect(t.routing_candidate_count).toBe(2);
        expect(t.routing_notice).toBe(
            "Needs routing — 2 people in this organization share this number."
        );
    });

    it("guesses no Person even though both candidates are loadable by phone", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_AMBIGUOUS)!;

        expect(t.sender_identity_state).toBe("unidentified");
        expect(t.reply_person_id).toBeNull();
        expect(t.contact_display).not.toContain("Rivera");
        expect(t.contact_display).toBe("Unidentified sender · ending in 0002");
    });

    it("leaks neither the candidate ids nor the raw number to the operator surface", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_AMBIGUOUS)!;
        const rendered = [t.contact_display, t.context_display, t.routing_notice, t.reply_display_label]
            .filter(Boolean)
            .join(" ");

        expect(rendered).not.toContain(AMBIG_A);
        expect(rendered).not.toContain(AMBIG_B);
        expect(rendered).not.toContain(AMBIG_PHONE);
    });

    it("stays replyable, by thread", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_AMBIGUOUS)!;

        expect(t.can_reply).toBe(true);
        expect(t.reply_authority).toBe("thread");
        expect(t.reply_display_label).toBe("ending in 0002");
    });
});

describe("A2 — Communications API: unknown Person, known tenant", () => {
    it("keeps the conversation visible and states the sender is unidentified", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_UNKNOWN)!;

        expect(t.sender_identity_state).toBe("unidentified");
        expect(t.contact_display).toBe("Unidentified sender · ending in 9999");
        expect(t.reply_person_id).toBeNull();
        expect(t.last_message_preview?.body).toBe("Do you have openings for a 3 year old?");
    });

    it("offers a thread-bound reply and no routing warning it has not earned", async () => {
        const { threads } = await loadInbox();
        const t = threads.find((x) => x.id === THREAD_UNKNOWN)!;

        expect(t.can_reply).toBe(true);
        expect(t.reply_authority).toBe("thread");
        // Unknown is not ambiguous: there is nothing for the operator to choose
        // between, so presenting a routing decision would invent one.
        expect(t.routing_state).toBe("routed");
        expect(t.routing_notice).toBeNull();
    });
});

describe("A2 — Communications API: tenant isolation and quarantine", () => {
    it("returns no other organization's conversation", async () => {
        const { threads } = await loadInbox();
        expect(threads.map((t) => t.org_id)).toEqual(threads.map(() => ORG));
        expect(threads).toHaveLength(3);
    });

    it("never reads the ingress quarantine table at all", async () => {
        await loadInbox();
        expect(readTables).not.toContain("communication_inbound_ingress");
        // Stronger than the assertion above: the fake throws on any table not
        // declared, so a future read of a quarantine view fails this suite too.
        expect(readTables.length).toBeGreaterThan(0);
    });
});
