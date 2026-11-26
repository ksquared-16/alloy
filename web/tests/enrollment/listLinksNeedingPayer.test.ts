/**
 * The operator's list of payerless Enrollment links: active, Enrollment-minted, no payer, open paperwork —
 * named by child and household, never a finished packet, never another link kind, and nothing written.
 */
import { describe, expect, it } from "vitest";

import { listLinksNeedingPayer } from "@/lib/enrollment/participantLaunch/listLinksNeedingPayer";

type Row = Record<string, unknown>;
const ORG = "org-1";

function db(tables: Record<string, Row[]>) {
    const writes: string[] = [];
    const get = (r: Row, c: string) => {
        const [col, key] = c.split("->>");
        return key ? ((r[col!] as Row | null)?.[key] ?? null) : (r[col!] ?? null);
    };
    return {
        writes,
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let limit = Infinity;
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => get(r, c) === v); return api; },
                is: (c: string, v: unknown) => { filters.push((r) => get(r, c) === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(get(r, c))); return api; },
                gt: (c: string, v: string) => { filters.push((r) => String(get(r, c)) > v); return api; },
                order: () => api,
                limit: (n: number) => { limit = n; return api; },
                update: () => { writes.push(table); return api; },
                insert: () => { writes.push(table); return Promise.resolve({ error: null }); },
                then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
            };
            return api;
        },
    };
}

const link = (id: string, metadata: Row, over: Row = {}) => ({ id, org_id: ORG, is_active: true, expires_at: null, created_at: `2026-09-0${id.length}T00:00:00Z`, metadata, ...over });
const enrollment = { created_via: "enrollment_start" };

function world() {
    return {
        form_public_links: [
            link("payerless", enrollment),
            link("bound", { ...enrollment, recipient_person_id: "p-mom" }),
            link("manual", { created_via: "manual_share" }),
            link("inactive", enrollment, { is_active: false }),
            link("expired", enrollment, { expires_at: "2026-01-01T00:00:00Z" }),
            link("done", enrollment),
            link("other-org", enrollment, { org_id: "org-2" }),
        ],
        form_packet_sessions: [
            { id: "s1", org_id: ORG, started_via_public_link_id: "payerless", status: "in_progress", crm_snapshot: { customer_id: "house-1" }, process_instance_id: "pi-1" },
            { id: "s2", org_id: ORG, started_via_public_link_id: "bound", status: "in_progress", crm_snapshot: { customer_id: "house-1" }, process_instance_id: "pi-1" },
            { id: "s3", org_id: ORG, started_via_public_link_id: "done", status: "completed", crm_snapshot: { customer_id: "house-1" }, process_instance_id: "pi-1" },
            { id: "s4", org_id: ORG, started_via_public_link_id: "manual", status: "in_progress", crm_snapshot: { customer_id: "house-1" }, process_instance_id: null },
        ],
        customers: [{ id: "house-1", org_id: ORG, name: "Real Household" }],
        customer_persons: [
            { org_id: ORG, customer_id: "house-1", role_type: "primary_contact", person_id: "p-mom" },
            { org_id: ORG, customer_id: "house-1", role_type: "primary_contact", person_id: "p-dad" },
            { org_id: ORG, customer_id: "house-1", role_type: "guardian", person_id: "p-gran" },
        ],
        process_instances: [{ id: "pi-1", org_id: ORG, subject_type: "child", subject_id: "kid-1" }],
        customer_members: [{ id: "kid-1", org_id: ORG, display_name: "Ava Real", first_name: "Ava", last_name: "Real" }],
    };
}

describe("listLinksNeedingPayer", () => {
    it("lists only the active, open, payerless Enrollment link — named in business terms", async () => {
        const client = db(world());
        const rows = await listLinksNeedingPayer(client as never, { orgId: ORG, now: new Date("2026-10-19T00:00:00Z") });
        expect(rows).toEqual([
            {
                linkId: "payerless",
                sessionId: "s1",
                sentAt: expect.any(String),
                childId: "kid-1",
                childName: "Ava Real",
                householdId: "house-1",
                householdName: "Real Household",
                // Primary contacts only — a guardian is not a payer candidate.
                candidateCount: 2,
            },
        ]);
        expect(client.writes).toEqual([]);
    });

    it("a finished packet is history, not work: nothing is listed", async () => {
        const w = world();
        w.form_packet_sessions[0]!.status = "completed";
        expect(await listLinksNeedingPayer(db(w) as never, { orgId: ORG })).toEqual([]);
    });

    it("a household with no primary contact is still listed, with zero candidates", async () => {
        const w = world();
        w.customer_persons = [];
        const rows = await listLinksNeedingPayer(db(w) as never, { orgId: ORG, now: new Date("2026-10-19T00:00:00Z") });
        expect(rows.map((r) => [r.linkId, r.candidateCount])).toEqual([["payerless", 0]]);
    });
});
