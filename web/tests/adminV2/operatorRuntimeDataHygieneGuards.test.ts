/** @vitest-environment node */

/**
 * Legacy Data Purge — operator-runtime data-hygiene guards (code prevention).
 *
 * The PRIMARY fix for bad operator data is data cleanup (audit SQL + cleanupEnrollmentLifecycleProcesses
 * + repair endpoint + backfill). These guards are the CODE half: operator/runtime reads must exclude
 * inactive/archived/legacy records, and demo/record data must never load via auto-migrations.
 *
 * Migration seed detection targets **migration-time** INSERT statements that run when the migration
 * applies. INSERT statements inside CREATE FUNCTION / CREATE OR REPLACE FUNCTION dollar-quoted bodies
 * are runtime mutation code (e.g. Processing Identity `execute_processing_identity_group`) and are
 * not migration seeds — strip those bodies before scanning.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLegacyArtifactProcessName } from "@/lib/admin/buildOperatorLifecycleLanding";

const web = resolve(__dirname, "../..");
const repo = resolve(web, "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

const OPERATOR_RECORD_INSERT =
    /insert\s+into\s+(public\.)?(opportunities|persons|customers|customer_members|customer_persons)\b/i;

/**
 * Remove PostgreSQL dollar-quoted string bodies (`$$…$$`, `$tag$…$tag$`).
 * Function definitions keep their CREATE header but lose body SQL so runtime
 * INSERT patterns inside SECURITY DEFINER RPCs are not classified as seeds.
 */
export function stripPostgresDollarQuotedBodies(sql: string): string {
    return sql.replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, "/*dollar-quoted-body*/");
}

/** True when a migration file would insert operator records at apply time. */
export function migrationSeedsOperatorRecords(sql: string): boolean {
    return OPERATOR_RECORD_INSERT.test(stripPostgresDollarQuotedBodies(sql));
}

describe("Operator runtime data-hygiene guards", () => {
    // ── item 4: no "(legacy)"-named process on operator surfaces (defense-in-depth) ──
    it("isLegacyArtifactProcessName flags only legacy/migration artifact names", () => {
        expect(isLegacyArtifactProcessName("Enrollment (legacy)")).toBe(true);
        expect(isLegacyArtifactProcessName("  enrollment (LEGACY) ")).toBe(true);
        expect(isLegacyArtifactProcessName("Enrollment")).toBe(false);
        expect(isLegacyArtifactProcessName("New Leads")).toBe(false);
        expect(isLegacyArtifactProcessName(null)).toBe(false);
    });

    it("the operator lifecycle landing gates visibility on the legacy-name check", () => {
        const src = read("lib/admin/buildOperatorLifecycleLanding.ts");
        expect(src).toMatch(
            /isOperatorVisibleLifecycle[\s\S]*isLegacyArtifactProcessName\(entry\.lifecycle_name\)/,
        );
    });

    // ── item 5: operator/runtime consumers require ACTIVE work units ──
    it("operator queue route requires an active work unit", () => {
        const src = read("app/api/admin/queues/[workUnitId]/[queueKey]/route.ts");
        expect(src).toMatch(/from\("work_units"\)[\s\S]*?\.eq\("is_active", true\)/);
    });

    it("action stage resolution excludes inactive work units", () => {
        const src = read("app/api/admin/actions/route.ts");
        expect(src).toMatch(/from\("work_units"\)[\s\S]*?\.eq\("is_active", true\)/);
    });

    it("server-side operator landing filters active work units", () => {
        const src = read("lib/admin/loadOperatorLifecycleLandingServer.ts");
        expect(src).toMatch(/from\("work_units"\)[\s\S]*?\.eq\("is_active", true\)/);
    });

    // ── item 6: demo/record data must NOT load via auto-migrations ──
    it("flags top-level operator-record inserts as migration seeds", () => {
        expect(
            migrationSeedsOperatorRecords(
                "INSERT INTO public.persons (org_id, first_name) VALUES ('x', 'Demo');\n",
            ),
        ).toBe(true);
        expect(
            migrationSeedsOperatorRecords(
                "insert into customers (org_id, name) values ('x', 'Household');\n",
            ),
        ).toBe(true);
    });

    it("does not treat INSERT inside CREATE FUNCTION bodies as migration seeds", () => {
        const rpcSql = `
CREATE OR REPLACE FUNCTION public.execute_processing_identity_group(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO persons (org_id, first_name, last_name, email, phone)
    VALUES (p_org_id, 'a', 'b', null, null);
    INSERT INTO customers (org_id, name) VALUES (p_org_id, 'Household');
    INSERT INTO customer_persons (org_id, customer_id, person_id, role_type)
    VALUES (p_org_id, 'x', 'y', 'primary_contact');
    INSERT INTO customer_members (org_id, customer_id, display_name)
    VALUES (p_org_id, 'x', 'Child');
    RETURN '{}'::jsonb;
END;
$$;
`;
        expect(migrationSeedsOperatorRecords(rpcSql)).toBe(false);
        // Top-level seed after a function still fails.
        expect(
            migrationSeedsOperatorRecords(`${rpcSql}\nINSERT INTO opportunities (org_id) VALUES ('x');\n`),
        ).toBe(true);
    });

    it("no NEW migration seeds operator record rows — demo belongs in gated seed scripts", () => {
        const migrationsDir = resolve(repo, "supabase/migrations");
        // Grandfathered historical migrations (already applied; removed via the data purge, not code):
        const ALLOWLIST = new Set([
            "20260423143000_opportunity_identity_seed_childcare_org.sql",
            "20260602150000_demo_kurzman_cleanup_person_gender_options.sql",
        ]);
        const offenders = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql") && !ALLOWLIST.has(f))
            .filter((f) => migrationSeedsOperatorRecords(readFileSync(resolve(migrationsDir, f), "utf8")));
        expect(
            offenders,
            `these migrations seed operator records — move to an explicit gated seed script:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });
});
