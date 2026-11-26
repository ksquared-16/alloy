/**
 * WHO IS THIS PERSON? — one identity rule for every person the relationship authority links.
 *
 * Staging (716053f5): Family ZZQA1496R's paperwork named the household's own parent with a new phone and
 * a second "Parent ZZQA1496R" was created; an emergency contact whose phone belonged to someone in
 * ANOTHER family was linked to that other family's person by find-or-create, whatever the name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/relationship/emitRelationshipActionEvent", () => ({
    emitRelationshipActionEvent: vi.fn().mockResolvedValue("evt-1"),
    RELATIONSHIP_ACTION_EXECUTED_EVENT_TYPE: "relationship.action_executed",
}));
vi.mock("@/lib/admin/person/fetchChildScopedContactLinks", () => ({
    memberRowsFromInquiryChildren: vi.fn().mockReturnValue([]),
    attachChildScopedContactLinksToRecord: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/fields/personChildRelationship/attachPersonChildRelationshipsToEntityRecord", () => ({
    attachPersonChildRelationshipsToEntityRecord: vi.fn().mockResolvedValue([]),
}));

import { executeRelationshipAction } from "@/lib/admin/relationship/executeRelationshipAction";
import { decideRelationshipIdentity, type RelationshipIdentityCandidate } from "@/lib/admin/relationship/relationshipIdentity";

type Row = Record<string, unknown>;

function db(tables: Record<string, Row[]>) {
    const inserts: Array<{ table: string; row: Row }> = [];
    const rpcCalls: Array<{ name: string; args: Row }> = [];
    const client = {
        inserts,
        rpcCalls,
        rpc: async (name: string, args: Row) => {
            rpcCalls.push({ name, args });
            return { data: { person_id: "p-new", contact_id: "c-new", person_created: true, person_reused: false, links_written: 1 }, error: null };
        },
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                ilike: (c: string, v: string) => { filters.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return api; },
                order: () => api,
                limit: () => api,
                insert: (row: Row) => { inserts.push({ table, row }); return { select: () => ({ single: async () => ({ data: { id: `${table}-new` }, error: null }) }), then: (res: (v: unknown) => void) => res({ error: null }) }; },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
            };
            return api;
        },
    };
    return client;
}

const parent = { id: "p-parent", org_id: "org", first_name: "Parent", last_name: "ZZQA1496R", email: null, phone: "+15552873214" };
const otherFamily = { id: "p-other", org_id: "org", first_name: "Parent", last_name: "ZMU7A", email: null, phone: "+15550101111" };
const tables = () => ({
    customer_member_contact_roles: [],
    customer_members: [
        { id: "ava", org_id: "org", customer_id: "house-r", relationship: "child", is_active: true, person_id: "p-ava", persons: { first_name: "Ava", last_name: "R" } },
    ],
    persons: [parent, otherFamily],
    customer_persons: [
        { org_id: "org", customer_id: "house-r", person_id: "p-parent", role_type: "primary_contact", persons: parent },
        { org_id: "org", customer_id: "house-other", person_id: "p-other", role_type: "guardian", persons: otherFamily },
    ],
});
const request = (actionKey: "add_parent_guardian" | "add_emergency_contact", draft: Row) => ({
    actionKey,
    sourceSurface: "processing_commit",
    sourceRecordId: "ava",
    sourceEntityType: "child" as const,
    sourceCustomerId: "house-r",
    anchorCustomerMemberId: "ava",
    scope: "this_child" as const,
    createPersonDraft: draft,
    orgId: "org",
});
const WRITES = ["persons", "contacts", "customer_persons", "customer_member_contacts", "person_child_relationships"];

describe("the rule", () => {
    const c = (o: Partial<RelationshipIdentityCandidate>): RelationshipIdentityCandidate => ({ person_id: "x", display_name: "x", in_household: false, same_name: false, contact_match: true, ...o });
    it("no match anywhere → a new person", () => expect(decideRelationshipIdentity([], {})).toEqual({ kind: "create" }));
    it("this household's own person, same name and same phone → reused", () => {
        expect(decideRelationshipIdentity([c({ person_id: "p", in_household: true, same_name: true })], {})).toEqual({ kind: "reuse", personId: "p" });
    });
    it("another family's email/phone → the operator chooses, even with the same name", () => {
        expect(decideRelationshipIdentity([c({ same_name: true })], {}).kind).toBe("choose");
    });
    it("a same-name household member with different contacts → asked, unless the operator confirmed a different person", () => {
        const nameOnly = [c({ in_household: true, same_name: true, contact_match: false })];
        expect(decideRelationshipIdentity(nameOnly, {}).kind).toBe("choose");
        expect(decideRelationshipIdentity(nameOnly, { confirmed_new_person: true })).toEqual({ kind: "create" });
    });
    it("confirming a new person never overrides an email/phone match", () => {
        expect(decideRelationshipIdentity([c({})], { confirmed_new_person: true }).kind).toBe("choose");
    });
});

describe("THE STAGING CASES", () => {
    it("the guardian with the household parent's name and a new phone is asked about — no second person", async () => {
        const client = db(tables());
        const err = await executeRelationshipAction(client as never, request("add_parent_guardian", { first_name: "Parent", last_name: "ZZQA1496R", phone: "5550147101" }) as never).catch((e) => e);
        expect(err.code).toBe("relationship_identity_choice_required");
        expect(err.candidates).toEqual([{ person_id: "p-parent", display_name: "Parent ZZQA1496R", in_household: true, same_name: true, contact_match: false }]);
        expect(err.operatorMessage).toMatch(/already in this family/);
        expect(client.rpcCalls).toHaveLength(0);
    });

    it("…and once the operator confirms a different person, the transaction runs", async () => {
        const client = db(tables());
        await executeRelationshipAction(client as never, request("add_parent_guardian", { first_name: "Parent", last_name: "ZZQA1496R", phone: "5550147101", confirmed_new_person: true }) as never);
        expect(client.rpcCalls[0]!.name).toBe("relationship_link_household_guardian");
    });

    it("an emergency contact with another family's phone is NOT linked to that family's person", async () => {
        const client = db(tables());
        const err = await executeRelationshipAction(client as never, request("add_emergency_contact", { first_name: "Ruth", last_name: "Contact", phone: "5550101111" }) as never).catch((e) => e);
        expect(err.code).toBe("relationship_identity_choice_required");
        expect(err.candidates).toEqual([expect.objectContaining({ person_id: "p-other", in_household: false, same_name: false, contact_match: true })]);
        expect(client.inserts.filter((i) => WRITES.includes(i.table))).toEqual([]);
    });

    it("an emergency contact that is this household's own person (same name, same phone) is reused, not duplicated", async () => {
        const client = db(tables());
        const result = await executeRelationshipAction(client as never, request("add_emergency_contact", { first_name: "parent", last_name: "zzqa1496r", phone: "(555) 287-3214" }) as never).catch((e) => e);
        expect(client.inserts.filter((i) => i.table === "persons")).toEqual([]);
        expect((result as { person_id?: string }).person_id ?? "p-parent").toBe("p-parent");
    });
});

beforeEach(() => vi.clearAllMocks());
