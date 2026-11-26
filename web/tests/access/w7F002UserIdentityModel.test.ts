/**
 * W7-F002 (corrected, Director 2026-10-14) — USER IDENTITY AND PERSON LINK ARE TWO THINGS.
 *
 * A login has its own editable human name; a link to a Person is optional. Money-capable access
 * requires that the operator can be NAMED (account name, or a link to a named Person) — never that
 * a Person exists. Email is never a name.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { normaliseAccountName, updateUserAccountName, UserAccountNameError } from "@/lib/access/userAccountNameService";
import { moneyCapableGrantRefusal } from "@/lib/access/personLinkRequirement";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const migration = () => read("../supabase/migrations/20261122180000_named_operator_identity.sql");

function fakeAdmin(opts: { member?: boolean; metadata?: Record<string, unknown> } = {}) {
    const calls: Array<{ kind: string; args: unknown }> = [];
    const client = {
        from: (table: string) => {
            const b: Record<string, unknown> = {
                select: () => b, eq: () => b,
                limit: async () => ({ data: table === "user_roles" && opts.member !== false ? [{ user_id: "u1" }] : [], error: null }),
                insert: async (row: unknown) => { calls.push({ kind: `insert:${table}`, args: row }); return { error: null }; },
            };
            return b;
        },
        auth: {
            admin: {
                getUserById: async () => ({ data: { user: { id: "u1", email: "kelly@example.com", user_metadata: opts.metadata ?? {} } }, error: null }),
                updateUserById: async (id: string, attrs: unknown) => { calls.push({ kind: "updateUserById", args: { id, attrs } }); return { error: null }; },
            },
        },
    };
    return { client: client as never, calls };
}

describe("editing a login's account name", () => {
    it("writes only the account name, keeps other metadata, and records an access event", async () => {
        const { client, calls } = fakeAdmin({ metadata: { locale: "en" } });
        const out = await updateUserAccountName(client, { orgId: "o", actorUserId: "admin", targetUserId: "u1", name: "  Kelly   Kurzman " });
        expect(out).toMatchObject({ name: "Kelly Kurzman", previousName: null, changed: true });
        const update = calls.find((c) => c.kind === "updateUserById")!.args as { attrs: { user_metadata: Record<string, unknown>; email?: string } };
        expect(update.attrs.user_metadata).toEqual({ locale: "en", full_name: "Kelly Kurzman" });
        expect(update.attrs).not.toHaveProperty("email");
        const audit = calls.find((c) => c.kind === "insert:mutation_events")!.args as Record<string, unknown>;
        expect(audit).toMatchObject({ command_key: "access.user.account_name_changed", domain: "access", operator_id: "admin", new_state: "Kelly Kurzman" });
        expect(calls.some((c) => /persons|user_person_links/.test(c.kind)), "never creates or links a Person").toBe(false);
    });

    it("refuses an email as a name, and a login outside the organisation", async () => {
        expect(() => normaliseAccountName("kelly@kurzmancapital.com")).toThrow(UserAccountNameError);
        await expect(updateUserAccountName(fakeAdmin({ member: false }).client, { orgId: "o", actorUserId: "a", targetUserId: "u1", name: "Kelly" }))
            .rejects.toMatchObject({ code: "user_not_in_org" });
    });
});

describe("money-capable grants require a NAMED operator, not a Person link", () => {
    it("the migration's predicate is a named Person link OR an account name — never the email", () => {
        const sql = migration();
        expect(sql).toMatch(/user_has_active_person_link\(p_org_id, p_user_id\)\s*OR public\.user_account_display_name\(p_user_id\) IS NOT NULL/);
        expect(sql).toMatch(/raw_user_meta_data ->> 'full_name'/);
        expect(sql).not.toMatch(/u\.email/);
    });

    it("all three enforcement points judge the named identity", () => {
        const sql = migration();
        expect(sql.match(/user_has_named_operator_identity\(/g)?.length).toBeGreaterThanOrEqual(4);
        expect(sql).not.toMatch(/NOT public\.user_has_active_person_link/);
        expect(sql).toContain("money_capable_grant_requires_named_operator");
    });

    it("unlinking is refused only when it would leave a money-capable login unnamed", () => {
        expect(migration()).toMatch(/IF public\.user_account_display_name\(p_user_id\) IS NULL\s*AND EXISTS/);
    });

    it("the refusal sentence asks for a NAME — recognising the old code too", () => {
        expect(moneyCapableGrantRefusal("money_capable_grant_requires_named_operator:fin.write")).toMatch(/name on file/);
        expect(moneyCapableGrantRefusal("money_capable_grant_requires_person_link:fin.write")).toMatch(/Add a name to this user/);
        expect(moneyCapableGrantRefusal("something else")).toBeNull();
    });
});

describe("Access → Users", () => {
    it("the account name is editable, and a missing name is the warning", () => {
        const control = read("components/adminV2/settings/access/AccountNameControl.tsx");
        expect(control).toContain('"/api/admin/access/account-name"');
        expect(control).toContain("Add a name to this account so operator and audit activity can identify who acted.");
    });

    it("an unlinked Person is optional — and carries no financial-integrity warning", () => {
        const link = read("components/adminV2/settings/access/UserPersonLinkControl.tsx");
        expect(link).toContain("Optional. Link this login when it corresponds to a Person managed in Alloy.");
        expect(link).not.toContain("cannot\n                    name who acted until it is linked");
        expect(link).not.toContain("access-user-person-link-money-gap");
    });

    it("the edit route is declared with the user-administration capability", () => {
        const decl = JSON.parse(read("scripts/routeCapabilities.declared.json"));
        expect(decl.routes["app/api/admin/access/account-name/route.ts"].PATCH.capability).toBe("admin.users.write");
    });
});
