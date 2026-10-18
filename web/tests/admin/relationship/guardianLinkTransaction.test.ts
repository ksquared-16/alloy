/**
 * THE GUARDIAN RELATIONSHIP IS ONE TRANSACTION, AND ONE ROLE AUTHORITY DECIDES WHAT IS VALID.
 *
 * Staging (89c6a4c3, Ava ZZQA1476ZMU7): the organization has NO contact-role rows. The resolver fell
 * back to platform defaults and chose "guardian"; the link writer re-checked the configured rows and
 * refused it — after the person, contact and household link had been written as separate calls.
 *
 * The transaction itself (rollback, reuse, refusals, grants) is proven against real Postgres by
 * certification/relationship/guardian-link-transaction.test.sql; this file proves the TypeScript side
 * routes every guardian write through it and never writes the tables directly.
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
import { RelationshipActionError } from "@/lib/admin/relationship/guardianLinkTransaction";
import {
    loadActiveMemberContactRoleKeys,
    PLATFORM_DEFAULT_MEMBER_CONTACT_ROLE_KEYS,
    upsertCustomerMemberContactLink,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";

type Row = Record<string, unknown>;
const WRITTEN_DIRECTLY = ["persons", "contacts", "customer_persons", "customer_member_contacts"];

function db(tables: Record<string, Row[]>, rpc: (name: string, args: Row) => { data: unknown; error: unknown } = () => ({ data: null, error: null }), opts: { roleLoadError?: boolean } = {}) {
    const inserts: Array<{ table: string; row: Row }> = [];
    const rpcCalls: Array<{ name: string; args: Row }> = [];
    const client = {
        inserts,
        rpcCalls,
        rpc: async (name: string, args: Row) => { rpcCalls.push({ name, args }); return rpc(name, args); },
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const result = () => (opts.roleLoadError && table === "customer_member_contact_roles" ? { data: null, error: { message: "boom" } } : { data: rows(), error: null });
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                order: () => api,
                limit: () => api,
                insert: (row: Row) => { inserts.push({ table, row }); (tables[table] ??= []).push(row); return { select: () => ({ single: async () => ({ data: { id: `${table}-new` }, error: null }) }), then: (res: (v: unknown) => void) => res({ error: null }) }; },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res(result()),
            };
            return api;
        },
    };
    return client;
}

const household = (roles: Row[] = []) => ({
    customer_member_contact_roles: roles,
    customer_members: [
        { id: "ava", org_id: "org", customer_id: "house-1", relationship: "child", is_active: true, person_id: "p-ava", persons: { first_name: "Ava", last_name: "Z" } },
    ],
});
const guardianRequest = {
    actionKey: "add_parent_guardian" as const,
    sourceSurface: "processing_commit",
    sourceRecordId: "ava",
    sourceEntityType: "child" as const,
    sourceCustomerId: "house-1",
    anchorCustomerMemberId: "ava",
    scope: "this_child" as const,
    createPersonDraft: { first_name: "Parent", last_name: "ZMU7A", phone: "5550101111" },
    orgId: "org",
};
const ok = () => ({ data: { person_id: "p-1", contact_id: "c-1", person_created: true, person_reused: false, links_written: 1 }, error: null });

describe("THE STAGING FAILURE: an organization with no configured roles", () => {
    it("writes the guardian through ONE transactional call — never person/contact/household/link separately", async () => {
        const client = db(household([]), ok);
        const result = await executeRelationshipAction(client as never, guardianRequest as never);
        expect(result.ok).toBe(true);
        expect(result.role_key).toBe("guardian");
        expect(client.rpcCalls).toHaveLength(1);
        expect(client.rpcCalls[0]).toMatchObject({
            name: "relationship_link_household_guardian",
            args: { p_org_id: "org", p_customer_id: "house-1", p_member_ids: ["ava"], p_role_key: "guardian", p_first_name: "Parent", p_last_name: "ZMU7A", p_person_id: null },
        });
        expect((client.rpcCalls[0]!.args.p_phone_match as string[]).length).toBeGreaterThan(0);
        expect(client.inserts.filter((i) => WRITTEN_DIRECTLY.includes(i.table))).toEqual([]);
    });

    it("a refusal inside the transaction leaves nothing behind and keeps its stable code and candidates", async () => {
        const candidates = [{ person_id: "p-x", display_name: "Parent ZMU7A", in_household: true, same_name: false }];
        const client = db(household([]), () => ({ data: null, error: { message: "relationship_identity_choice_required", details: JSON.stringify(candidates) } }));
        const err = await executeRelationshipAction(client as never, guardianRequest as never).catch((e) => e);
        expect(err).toBeInstanceOf(RelationshipActionError);
        expect(err.code).toBe("relationship_identity_choice_required");
        expect(err.candidates).toEqual(candidates);
        expect(err.operatorMessage).not.toMatch(/sqlstate|postgres|relationship_link_household_guardian/i);
        expect(client.inserts.filter((i) => WRITTEN_DIRECTLY.includes(i.table))).toEqual([]);
    });

    it("an unexpected database error is a stable code with a safe message; the raw text stays server-side", async () => {
        const client = db(household([]), () => ({ data: null, error: { message: 'duplicate key value violates unique constraint "x"', code: "23505" } }));
        const err = await executeRelationshipAction(client as never, guardianRequest as never).catch((e) => e);
        expect(err.code).toBe("relationship_write_failed");
        expect(err.operatorMessage).not.toMatch(/duplicate key|constraint/);
    });

    it("missing identity is refused before the transaction is even called", async () => {
        const client = db(household([]), ok);
        const err = await executeRelationshipAction(client as never, { ...guardianRequest, createPersonDraft: { first_name: "Parent", last_name: "", phone: "5550101111" } } as never).catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(client.rpcCalls).toHaveLength(0);
    });

    it("an operator-selected existing person is passed as the person — no draft, no new person", async () => {
        const client = db(household([]), () => ({ data: { person_id: "p-orphan", contact_id: "c-1", person_created: false, person_reused: true, links_written: 1 }, error: null }));
        await executeRelationshipAction(client as never, { ...guardianRequest, createPersonDraft: undefined, selectedPersonId: "p-orphan" } as never);
        expect(client.rpcCalls[0]!.args).toMatchObject({ p_person_id: "p-orphan", p_first_name: null, p_phone: null, p_phone_match: null });
    });
});

describe("one effective-role authority for the resolver and the writer", () => {
    it("no configuration: the platform defaults", async () => {
        expect([...(await loadActiveMemberContactRoleKeys(db({ customer_member_contact_roles: [] }) as never, "org"))].sort()).toEqual([...PLATFORM_DEFAULT_MEMBER_CONTACT_ROLE_KEYS].sort());
    });

    it("explicit configuration: exactly the active roles; a disabled role is refused", async () => {
        const roles = [
            { org_id: "org", role_key: "parent", is_active: true },
            { org_id: "org", role_key: "guardian", is_active: false },
        ];
        expect([...(await loadActiveMemberContactRoleKeys(db({ customer_member_contact_roles: roles }) as never, "org"))]).toEqual(["parent"]);
    });

    it("configured but all disabled: no roles — the guardian action refuses before any write", async () => {
        const client = db(household([{ org_id: "org", role_key: "guardian", is_active: false }]), ok);
        await expect(executeRelationshipAction(client as never, guardianRequest as never)).rejects.toThrow();
        expect(client.rpcCalls).toHaveLength(0);
        expect(client.inserts).toEqual([]);
    });

    it("an unreadable configuration is refused, not treated as permission to use defaults", async () => {
        await expect(loadActiveMemberContactRoleKeys(db({}, undefined, { roleLoadError: true }) as never, "org")).rejects.toThrow();
    });

    it("the writer accepts exactly what the resolver accepts (no configuration: guardian is written)", async () => {
        const client = db({ customer_member_contact_roles: [], customer_member_contacts: [] });
        const r = await upsertCustomerMemberContactLink(client as never, { orgId: "org", customerId: "house-1", customerMemberId: "ava", contactId: "c-1", roleKey: "guardian" });
        expect(r).toEqual({ inserted: true, skipped_invalid_role: false });
    });
});

beforeEach(() => vi.clearAllMocks());
