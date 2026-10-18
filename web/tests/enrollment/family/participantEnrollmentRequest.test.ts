/**
 * "ADD ANOTHER CHILD" FOR AN EXISTING HOUSEHOLD CHILD — a request into the normal admissions workflow.
 *
 * Policy: no second child, no accepted offer, no Enrolling, no packet, no fee. The only write is the
 * child's `new_inquiry` participation on the family's own episode, through the canonical writer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    childRequestStatus,
    listHouseholdChildrenForRequest,
    requestEnrollmentForExistingChild,
    REQUEST_SOURCE,
} from "@/lib/enrollment/family/participantEnrollmentRequest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let writes: Array<{ table: string; row: Row }>;

function db() {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            let pendingInsert: Row | null = null;
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
                limit: () => api,
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                insert: (row: Row) => {
                    pendingInsert = { id: `new-${writes.length + 1}`, ...row };
                    writes.push({ table, row: pendingInsert });
                    (tables[table] ??= []).push(pendingInsert);
                    return api;
                },
                single: async () => ({ data: pendingInsert, error: null }),
                update: () => { throw new Error(`UPDATE on ${table}`); },
                then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
            };
            return api;
        },
    } as never;
}

const ORG = "org";
const HOUSE = "house-1";
const OPP = "opp-1";

beforeEach(() => {
    writes = [];
    tables = {
        customer_members: [
            { id: "ava", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true, display_name: "Ava" },
            { id: "ben", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true, display_name: "Ben" },
            { id: "cy", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true, display_name: "Cy" },
            { id: "dee", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true, display_name: "Dee" },
            { id: "eve", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true, display_name: "Eve" },
            { id: "zed", org_id: ORG, customer_id: "other-house", relationship: "child", is_active: true, display_name: "Zed" },
        ],
        opportunities: [
            { id: OPP, org_id: ORG, customer_id: HOUSE },
            { id: "opp-other", org_id: ORG, customer_id: "other-house" },
        ],
        process_instances: [
            { subject_id: "ava", org_id: ORG, process_key: "enrollment", state: null, stage_key: "enrolling", created_at: "2026-10-01" },
            { subject_id: "ben", org_id: ORG, process_key: "enrollment", state: null, stage_key: "waitlist", created_at: "2026-10-01" },
            { subject_id: "cy", org_id: ORG, process_key: "enrollment", state: "enrolled", stage_key: "enrolled", created_at: "2026-09-01" },
        ],
        opportunity_customer_members: [
            { id: "ocm-ava", org_id: ORG, customer_member_id: "ava", opportunity_id: OPP, outcome_status_key: "enrolling" },
            { id: "ocm-dee", org_id: ORG, customer_member_id: "dee", opportunity_id: OPP, outcome_status_key: "offered" },
        ],
    };
});

describe("where each household child stands", () => {
    it.each([
        [[{ state: null, stage_key: "enrolling" }], [], "in_progress"],
        [[{ state: null, stage_key: "waitlist" }], [], "waitlisted"],
        [[{ state: "enrolled", stage_key: "enrolled" }], [], "enrolled"],
        [[], [{ opportunity_id: "o", outcome_status_key: "new_inquiry" }], "being_reviewed"],
        [[], [{ opportunity_id: "o", outcome_status_key: "offered" }], "being_reviewed"],
        [[], [{ opportunity_id: "o", outcome_status_key: "waitlisted" }], "waitlisted"],
        [[{ state: "withdrawn", stage_key: null }], [{ opportunity_id: "o", outcome_status_key: "withdrawn" }], "available"],
        [[], [], "available"],
    ])("%j / %j → %s", (journeys, participations, expected) => {
        expect(childRequestStatus(journeys as never, participations as never)).toBe(expected);
    });

    it("lists only the household's own active children", async () => {
        const list = await listHouseholdChildrenForRequest(db(), { orgId: ORG, customerId: HOUSE });
        expect(Object.fromEntries(list.map((c) => [c.customerMemberId, c.status]))).toEqual({
            ava: "in_progress", ben: "waitlisted", cy: "enrolled", dee: "being_reviewed", eve: "available",
        });
    });
});

describe("requesting enrollment for an existing child", () => {
    const req = (customerMemberId: string, opportunityId: string | null = OPP) =>
        requestEnrollmentForExistingChild(db(), { orgId: ORG, customerId: HOUSE, opportunityId, customerMemberId });

    it("a valid request writes exactly one new-inquiry participation on the family's episode — nothing else", async () => {
        const r = await req("eve");
        expect(r.ok && r.created).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({
            table: "opportunity_customer_members",
            row: { opportunity_id: OPP, customer_member_id: "eve", outcome_status_key: "new_inquiry", metadata: { source: REQUEST_SOURCE } },
        });
        // No journey, no packet, no fee, no offer.
        expect(writes.some((w) => ["process_instances", "form_packet_sessions", "charges"].includes(w.table))).toBe(false);
    });

    it("a repeated request is refused — the child is already being considered", async () => {
        await req("eve");
        const again = await req("eve");
        expect(again.ok).toBe(false);
        expect(!again.ok && again.refusal.code).toBe("already_active");
        expect(writes).toHaveLength(1);
    });

    it.each([
        ["ava", "in_progress"],
        ["ben", "waitlisted"],
        ["cy", "enrolled"],
        ["dee", "being_reviewed"],
    ])("%s (%s) is refused, with where they stand", async (child, status) => {
        const r = await req(child);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.refusal.code).toBe("already_active");
        expect(!r.ok && r.refusal.code === "already_active" && r.refusal.status).toBe(status);
        expect(writes).toHaveLength(0);
    });

    it("another household's child cannot be requested", async () => {
        const r = await req("zed");
        expect(!r.ok && r.refusal.code).toBe("not_household_child");
        expect(writes).toHaveLength(0);
    });

    it("without a family episode, or with another household's episode, nothing is written", async () => {
        expect((await req("eve", null)).ok).toBe(false);
        expect((await req("eve", "opp-other")).ok).toBe(false);
        expect(writes).toHaveLength(0);
    });

    it("a participation this episode already CLOSED is not silently reused", async () => {
        tables.opportunity_customer_members.push({ id: "ocm-eve", org_id: ORG, customer_member_id: "eve", opportunity_id: OPP, outcome_status_key: "withdrawn" });
        const r = await req("eve");
        expect(!r.ok && r.refusal.code).toBe("previously_closed");
        expect(writes).toHaveLength(0);
    });
});

describe("the route: only the household adult the link was addressed to may ask", () => {
    const mocks = vi.hoisted(() => ({ recipient: "parent-1" as string | null, linkId: "link-1" }));
    vi.mock("@/lib/supabase/serverServiceClient", () => ({ createServiceRoleClient: () => db() }));
    vi.mock("@/lib/public/forms/resolveParticipantEnrollmentFromToken", () => ({
        resolveParticipantEnrollmentFromToken: async () => ({ ok: true, value: { orgId: ORG, linkId: mocks.linkId, session: { crm_snapshot: { customer_id: HOUSE } } } }),
    }));
    vi.mock("@/lib/enrollment/family/resolveFamilyEnrollmentExperience", () => ({
        resolveFamilyEnrollmentExperience: async () => ({ ok: true, value: { opportunityId: OPP } }),
    }));

    const post = async (body: unknown) => {
        const { POST } = await import("@/app/api/public/forms/[token]/enrollment-request/route");
        const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ token: "t" }) });
        return { status: res.status, json: await res.json() };
    };

    beforeEach(() => {
        tables.form_public_links = [{ id: "link-1", org_id: ORG, metadata: { recipient_person_id: mocks.recipient } }];
        tables.customer_persons = [{ org_id: ORG, customer_id: HOUSE, person_id: "parent-1" }];
    });

    it("the household's own parent can request", async () => {
        const r = await post({ customer_member_id: "eve" });
        expect(r.status).toBe(200);
        expect(r.json.data).toMatchObject({ requested: true });
    });

    it("a link addressed to nobody is refused", async () => {
        tables.form_public_links = [{ id: "link-1", org_id: ORG, metadata: {} }];
        expect((await post({ customer_member_id: "eve" })).status).toBe(403);
        expect(writes).toHaveLength(0);
    });

    it("a link addressed to someone outside the household is refused", async () => {
        tables.form_public_links = [{ id: "link-1", org_id: ORG, metadata: { recipient_person_id: "stranger" } }];
        expect((await post({ customer_member_id: "eve" })).status).toBe(403);
        expect(writes).toHaveLength(0);
    });

    it("another household's child is refused through the route too", async () => {
        expect((await post({ customer_member_id: "zed" })).status).toBe(404);
    });
});
