/**
 * A payerless Enrollment link gets its payer by operator decision only — never a reassignment, never a
 * cross-household person, never silently when the household has several primary contacts.
 */
import { describe, expect, it } from "vitest";

import { bindLinkPayer, previewLinkPayerBinding } from "@/lib/enrollment/participantLaunch/linkPayerBinding";

type Row = Record<string, unknown>;

function db(tables: Record<string, Row[]>, opts: { raceBindsFirst?: boolean } = {}) {
    const updates: Row[] = [];
    const inserts: Array<{ table: string; row: Row }> = [];
    const client = {
        updates,
        inserts,
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let patch: Row | null = null;
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => {
                    if (patch) {
                        if (opts.raceBindsFirst) return Promise.resolve({ data: [], error: null });
                        const hit = rows();
                        for (const r of hit) Object.assign(r, patch);
                        updates.push(patch);
                        return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
                    }
                    return api;
                },
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                is: (c: string, v: unknown) => {
                    const [col, key] = c.split("->>");
                    filters.push((r) => ((r[col!] as Row | null)?.[key!] ?? null) === v);
                    return api;
                },
                update: (p: Row) => { patch = p; return api; },
                insert: (row: Row) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
            };
            return api;
        },
    };
    return client;
}

const ORG = "org-1";
const world = (over: { link?: Row; session?: Row; contacts?: Row[] } = {}) => ({
    form_public_links: [{ id: "link-1", org_id: ORG, is_active: true, expires_at: null, metadata: { created_via: "enrollment_start", stage_key: "enrolling", share_embed_path: "/p/x" }, ...over.link }],
    form_packet_sessions: [{ id: "sess-1", org_id: ORG, started_via_public_link_id: "link-1", status: "in_progress", crm_snapshot: { customer_id: "house-1" }, ...over.session }],
    customer_persons: over.contacts ?? [
        { org_id: ORG, customer_id: "house-1", role_type: "primary_contact", person_id: "p-mom", persons: { id: "p-mom", org_id: ORG, first_name: "Mom", last_name: "Real" } },
        { org_id: ORG, customer_id: "house-2", role_type: "primary_contact", person_id: "p-other", persons: { id: "p-other", org_id: ORG, first_name: "Other", last_name: "Family" } },
    ],
});
const bind = (tables: Record<string, Row[]>, personId: string, extra: { confirmed?: boolean } = {}, opts = {}) => {
    const client = db(tables, opts);
    return { client, result: bindLinkPayer(client as never, { orgId: ORG, linkId: "link-1", personId, confirmed: extra.confirmed ?? true, actorUserId: "op-1", now: new Date("2026-10-18T18:00:00Z") }) };
};

describe("preview", () => {
    it("names the household's primary contact as the candidate — and binds nothing", async () => {
        const t = world();
        const r = await previewLinkPayerBinding(db(t) as never, { orgId: ORG, linkId: "link-1" });
        expect(r.ok && r.value).toMatchObject({ sessionId: "sess-1", customerId: "house-1", candidates: [{ personId: "p-mom", name: "Mom Real" }], choiceRequired: false });
        expect((t.form_public_links[0]!.metadata as Row).recipient_person_id).toBeUndefined();
    });

    it("a household with two primary contacts requires the operator's choice", async () => {
        const contacts = [
            { org_id: ORG, customer_id: "house-1", role_type: "primary_contact", person_id: "p-a", persons: { id: "p-a", org_id: ORG, first_name: "A", last_name: "X" } },
            { org_id: ORG, customer_id: "house-1", role_type: "primary_contact", person_id: "p-b", persons: { id: "p-b", org_id: ORG, first_name: "B", last_name: "X" } },
        ];
        const r = await previewLinkPayerBinding(db(world({ contacts })) as never, { orgId: ORG, linkId: "link-1" });
        expect(r.ok && r.value.choiceRequired).toBe(true);
        expect(r.ok && r.value.candidates.map((c) => c.personId)).toEqual(["p-a", "p-b"]);
    });

    it.each([
        ["a non-Enrollment link", { link: { metadata: { created_via: "packet_share" } } }, "not_an_enrollment_link"],
        ["an inactive link", { link: { is_active: false } }, "link_inactive"],
        ["an expired link", { link: { expires_at: "2026-01-01T00:00:00Z" } }, "link_inactive"],
        ["finished paperwork", { session: { status: "completed" } }, "session_not_open"],
        ["a link that already has a payer", { link: { metadata: { created_via: "enrollment_start", recipient_person_id: "p-x" } } }, "payer_already_bound"],
        ["a household with no primary contact", { contacts: [] }, "no_primary_contact"],
    ])("refuses %s", async (_label, over, code) => {
        const r = await previewLinkPayerBinding(db(world(over as never)) as never, { orgId: ORG, linkId: "link-1" });
        expect(!r.ok && r.refusal.code).toBe(code);
    });
});

describe("bind", () => {
    it("records the chosen candidate, who bound it and when — on the same link, keeping its history", async () => {
        const t = world();
        const { client, result } = bind(t, "p-mom");
        expect((await result).ok).toBe(true);
        expect(t.form_public_links[0]!.metadata).toEqual({
            created_via: "enrollment_start", stage_key: "enrolling", share_embed_path: "/p/x",
            recipient_person_id: "p-mom", recipient_bound_at: "2026-10-18T18:00:00.000Z", recipient_bound_by: "op-1", recipient_bound_via: "operator_payer_binding",
        });
        expect(client.inserts).toEqual([expect.objectContaining({ table: "workflow_events", row: expect.objectContaining({ event_type: "enrollment_link_payer_bound", entity_id: "link-1" }) })]);
    });

    it("refuses without the operator's confirmation", async () => {
        const t = world();
        const { client, result } = bind(t, "p-mom", { confirmed: false });
        expect(!(await result).ok && ((await result) as { refusal: { code: string } }).refusal.code).toBe("confirmation_required");
        expect(client.updates).toEqual([]);
    });

    it("refuses a person from another household", async () => {
        const t = world();
        const { client, result } = bind(t, "p-other");
        expect(((await result) as { refusal?: { code: string } }).refusal?.code).toBe("payer_not_a_candidate");
        expect(client.updates).toEqual([]);
    });

    it("never replaces a payer — including one bound by someone else in the meantime", async () => {
        const already = world({ link: { metadata: { created_via: "enrollment_start", recipient_person_id: "p-first" } } });
        const first = bind(already, "p-mom");
        expect(((await first.result) as { refusal?: { code: string } }).refusal?.code).toBe("payer_already_bound");
        expect((already.form_public_links[0]!.metadata as Row).recipient_person_id).toBe("p-first");

        const race = bind(world(), "p-mom", {}, { raceBindsFirst: true });
        expect(((await race.result) as { refusal?: { code: string } }).refusal?.code).toBe("payer_already_bound");
        expect(race.client.inserts).toEqual([]);
    });
});
