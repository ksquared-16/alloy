import { describe, expect, it } from "vitest";

import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";

/**
 * THE PROFILE READ REPAIR PRESERVES SEMANTICS (P0-7.6 · A′ Slice 1 item B).
 *
 * This read was three serial round trips at 399 ms P50 deployed and is now two parallel queries at
 * one hop of depth. It is a live product read with four callers — the Health card, the durable
 * child subject, the drawer attach and the customer-members route — so the only thing that makes
 * the repair safe is that the ANSWER is unchanged.
 *
 * Driven through a fake client that records what was asked, because the failure worth catching is
 * a silently widened scope: a repair that drops the org filter or the active-definition filter
 * returns MORE rows and still looks green on a happy-path fixture.
 */

type Captured = { table: string; filters: Record<string, unknown>; ins: Record<string, unknown[]> };

function fakeSupabase(rows: { members: unknown[]; values: unknown[] }, captured: Captured[]) {
    return {
        from(table: string) {
            const cap: Captured = { table, filters: {}, ins: {} };
            captured.push(cap);
            const b = {
                select() { return b; },
                eq(col: string, val: unknown) { cap.filters[col] = val; return b; },
                in(col: string, vals: unknown[]) { cap.ins[col] = vals; return b; },
                then(resolve: (r: { data: unknown[] }) => void) {
                    resolve({ data: table === "customer_members" ? rows.members : rows.values });
                },
            };
            return b;
        },
    } as never;
}

const value = (entityId: string, key: string, text: string, type = "text") => ({
    entity_id: entityId,
    value_text: text,
    field_definitions: { field_key: key, field_type: type, entity_type: "customer_member", is_active: true },
});

describe("customer_member profile read repair", () => {
    it("returns native fields and configured values in one answer", async () => {
        const captured: Captured[] = [];
        const sb = fakeSupabase({
            members: [{ id: "m1", person_id: "p1", first_name: "Emma", last_name: "J", dob: "2020-01-02" }],
            values: [value("m1", "gender", "female", "select"), value("m1", "allergies", "peanut")],
        }, captured);
        const out = await loadCustomerMemberProfileFieldsByMemberId(sb, "org-1", ["m1"]);
        expect(out.get("m1")).toEqual({
            person_id: "p1", first_name: "Emma", last_name: "J", dob: "2020-01-02",
            gender: "female", allergies: "peanut",
        });
    });

    it("THE GATE: scope filters survive the repair — org, entity type and active definitions", () => {
        // A repair that widens scope returns more rows and still passes a happy-path fixture.
        const captured: Captured[] = [];
        const sb = fakeSupabase({ members: [], values: [] }, captured);
        return loadCustomerMemberProfileFieldsByMemberId(sb, "org-1", ["m1"]).then(() => {
            const values = captured.find((c) => c.table === "field_values")!;
            expect(values.filters.org_id).toBe("org-1");
            expect(values.filters.entity_type).toBe("customer_member");
            expect(values.filters["field_definitions.is_active"]).toBe(true);
            expect(values.ins.entity_id).toEqual(["m1"]);
            expect((values.ins["field_definitions.field_key"] ?? []).length).toBeGreaterThan(0);
            const members = captured.find((c) => c.table === "customer_members")!;
            expect(members.filters.org_id).toBe("org-1");
        });
    });

    it("THE DEPENDENCY IS GONE: field_definitions is no longer read as its own round trip", async () => {
        const captured: Captured[] = [];
        const sb = fakeSupabase({ members: [], values: [] }, captured);
        await loadCustomerMemberProfileFieldsByMemberId(sb, "org-1", ["m1"]);
        expect(captured.map((c) => c.table).sort()).toEqual(["customer_members", "field_values"]);
        expect(captured.some((c) => c.table === "field_definitions")).toBe(false);
    });

    it("a value for a member outside the requested set does not invent a row", async () => {
        const captured: Captured[] = [];
        const sb = fakeSupabase({
            members: [{ id: "m1", person_id: null, first_name: null, last_name: null, dob: null }],
            values: [value("m1", "gender", "female"), value("m-other", "gender", "male")],
        }, captured);
        const out = await loadCustomerMemberProfileFieldsByMemberId(sb, "org-1", ["m1"]);
        expect(out.has("m-other")).toBe(false);
        expect(out.size).toBe(1);
    });

    it("no members means no queries and an empty map", async () => {
        const captured: Captured[] = [];
        const sb = fakeSupabase({ members: [], values: [] }, captured);
        const out = await loadCustomerMemberProfileFieldsByMemberId(sb, "org-1", []);
        expect(out.size).toBe(0);
        expect(captured).toHaveLength(0);
    });

    it("a member with no configured values keeps its native fields", async () => {
        // KNOWN-EMPTY is a real answer and must not be confused with a failed read.
        const captured: Captured[] = [];
        const sb = fakeSupabase({
            members: [{ id: "m1", person_id: "p1", first_name: "Liam", last_name: null, dob: null }],
            values: [],
        }, captured);
        const out = await loadCustomerMemberProfileFieldsByMemberId(sb, "org-1", ["m1"]);
        expect(out.get("m1")).toEqual({ person_id: "p1", first_name: "Liam", last_name: null, dob: null });
    });
});
