/** @vitest-environment node */

/**
 * Legacy Data Purge — operator-runtime data-hygiene guards (code prevention).
 *
 * The PRIMARY fix for bad operator data is data cleanup (audit SQL + cleanupEnrollmentLifecycleProcesses
 * + repair endpoint + backfill). These guards are the CODE half: operator/runtime reads must exclude
 * inactive/archived/legacy records, and demo/record data must never load via auto-migrations.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLegacyArtifactProcessName } from "@/lib/admin/buildOperatorLifecycleLanding";

const web = resolve(__dirname, "../..");
const repo = resolve(web, "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

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
    it("no NEW migration seeds operator record rows — demo belongs in gated seed scripts", () => {
        const migrationsDir = resolve(repo, "supabase/migrations");
        // Grandfathered historical migrations (already applied; removed via the data purge, not code):
        const ALLOWLIST = new Set([
            "20260423143000_opportunity_identity_seed_childcare_org.sql",
            "20260602150000_demo_kurzman_cleanup_person_gender_options.sql",
        ]);
        const recordInsert =
            /insert\s+into\s+(public\.)?(opportunities|persons|customers|customer_members|customer_persons)\b/i;
        const offenders = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql") && !ALLOWLIST.has(f))
            .filter((f) => recordInsert.test(readFileSync(resolve(migrationsDir, f), "utf8")));
        expect(
            offenders,
            `these migrations seed operator records — move to an explicit gated seed script:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });
});
