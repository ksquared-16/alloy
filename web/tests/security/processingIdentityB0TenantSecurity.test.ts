import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260716120000_processing_identity_b0_tenant_security.sql",
);

describe("processing identity B0 tenant security migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    const identityTables = [
        "customers",
        "opportunities",
        "opportunity_customer_members",
        "opportunity_persons",
    ] as const;

    it("replaces cross-tenant admin_ops_full_access on identity-bearing tables", () => {
        for (const table of identityTables) {
            expect(sql).toContain(`'${table}'`);
        }
        expect(sql).toContain("DROP POLICY IF EXISTS admin_ops_full_access ON public.contacts");
        expect(sql).toMatch(/DROP POLICY IF EXISTS admin_ops_full_access ON public\.%I/);
        expect(sql).toContain("_select_org");
        expect(sql).toContain("_insert_org");
        expect(sql).toContain("_update_org");
        expect(sql).toContain("_delete_org");
        expect(sql).toContain("_all_service_role");
    });

    it("scopes authenticated access with has_org_role(org_id, …)", () => {
        expect(sql).not.toMatch(
            /CREATE POLICY[\s\S]*admin_ops_full_access[\s\S]*app_users/i,
        );
        const hasOrgRoleMatches = sql.match(/has_org_role\(org_id/g) ?? [];
        expect(hasOrgRoleMatches.length).toBeGreaterThanOrEqual(5);
    });

    it("preserves org-scoped contacts policies and adds org-scoped delete", () => {
        expect(sql).toContain("contacts_delete_by_org_role");
        expect(sql).toContain("contacts_all_service_role");
        expect(sql).not.toContain("DROP POLICY contacts_select_by_org_role");
        expect(sql).not.toContain("DROP POLICY contacts_insert_by_org_role");
        expect(sql).not.toContain("DROP POLICY contacts_update_by_org_role");
    });

    it("adds persons.org_id FK with orphan preflight guard", () => {
        expect(sql).toContain("persons_org_id_fkey");
        expect(sql).toContain("REFERENCES public.orgs (id) ON DELETE RESTRICT");
        expect(sql).toContain("persons_org_id_fkey preflight failed");
        expect(sql).toMatch(
            /FROM public\.persons p[\s\S]*LEFT JOIN public\.orgs o ON o\.id = p\.org_id[\s\S]*WHERE o\.id IS NULL/,
        );
    });

    it("does not add identity uniqueness or processing tables (B0 boundary)", () => {
        expect(sql).not.toMatch(/CREATE UNIQUE INDEX/i);
        expect(sql).not.toMatch(/processing_facts|processing_resolutions|processing_commit_plans/i);
        expect(sql).not.toMatch(/contacts_email_unique|contacts_phone_unique|ux_contacts_/i);
    });

    it("cleans up migration-local helper function", () => {
        expect(sql).not.toContain("_proc_identity_b0_apply_org_policies");
    });
});

describe("processing identity B0 security contract (static cross-tenant denial)", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("does not grant cross-tenant access via global app_users.role checks in new policies", () => {
        const createPolicyBlocks = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
        for (const block of createPolicyBlocks) {
            if (block.includes("admin_ops_full_access")) continue;
            expect(block).not.toMatch(/FROM public\.app_users[\s\S]*role = ANY/);
        }
    });

    it("documents tables already org-scoped before B0 (no regression intent)", () => {
        // persons, customer_persons, customer_members use user_roles org match in baseline schema.
        // B0 targets the confirmed admin_ops_full_access gap only.
        expect(sql).not.toContain("DROP POLICY persons_select_by_org_role");
        expect(sql).not.toContain("DROP POLICY customer_members_modify_admin_ops");
    });
});

describe("processing identity B0 — cumulative schema expectations", () => {
    const rlsCsv = readFileSync(
        resolve(__dirname, "../../../docs/supabase/reference/supabase_rls_policies.csv"),
        "utf8",
    );
    const indexesCsv = readFileSync(
        resolve(__dirname, "../../../docs/supabase/reference/supabase_indexes.csv"),
        "utf8",
    );
    const constraintsCsv = readFileSync(
        resolve(__dirname, "../../../docs/supabase/reference/supabase_constraints.csv"),
        "utf8",
    );

    it("audit baseline: admin_ops_full_access was present on named identity tables", () => {
        for (const table of [
            "customers",
            "opportunities",
            "contacts",
            "opportunity_customer_members",
            "opportunity_persons",
        ]) {
            expect(rlsCsv).toContain(`${table},admin_ops_full_access`);
        }
    });

    it("audit baseline: persons lacked org_id FK in generated constraints reference", () => {
        expect(constraintsCsv).not.toMatch(/,persons,persons_org_id_fkey,/);
        expect(constraintsCsv).toContain("customers_org_id_fkey");
        expect(constraintsCsv).toContain("contacts_org_id_fkey");
    });

    it("audit baseline: contacts global uniques remain (deferred to Phase E)", () => {
        expect(indexesCsv).toContain("contacts_email_unique");
        expect(indexesCsv).toContain("contacts_phone_unique");
    });
});
