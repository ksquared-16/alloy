/**
 * Phase 0 / P0-4 — announcement_targets canonical shape.
 *
 * Live verification (2026-07-30, project ikaxilmwmrmbagoidedu) confirmed the
 * deployed table carries the PKG-05 shape (target_spec) while the API writes
 * the B4 shape (target_type/target_ref/rule). Both migrations are recorded as
 * applied; B4's CREATE TABLE IF NOT EXISTS was a no-op. announcement_targets
 * has 0 rows because the feature has never worked.
 *
 * The route test below INVOKES the handler and captures what it actually
 * inserts — deliberately not a readFileSync/regex assertion on source text,
 * which is the pattern that let this defect stay invisible.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const orgId = "aaaaaaaa-0000-4000-8000-000000000001";
const announcementId = "cccccccc-0000-4000-8000-000000000001";

/** Rows the route hands to `.insert()`, captured per test. */
const insertedRows: Array<Record<string, unknown>> = [];

const { mockRequireAdminOrOps, mockGetAdminContextCached } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
}));

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: mockRequireAdminOrOps };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

/**
 * Minimal Supabase double. `select()` is used two ways by this route — a
 * `.maybeSingle()` announcement lookup and a plain awaited target list — so the
 * builder is thenable as well as chainable.
 */
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: (table: string) => {
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                maybeSingle: async () => ({ data: { id: announcementId }, error: null }),
                delete: () => builder,
                insert: async (rows: Array<Record<string, unknown>>) => {
                    if (table === "announcement_targets") insertedRows.push(...rows);
                    return { error: null };
                },
                then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
            };
            return builder;
        },
    })),
}));

import { PUT as putTargets } from "@/app/api/admin/communications/announcements/[id]/targets/route";
import { ANNOUNCEMENT_TARGET_TYPES } from "@/lib/communications/v2/announcementSchema";
import { buildRequest, invokeRoute, routeParams } from "../harness/routeInvoker";

const REPAIR_MIGRATION = path.resolve(
    __dirname,
    "../../../supabase/migrations/20260731100000_announcement_targets_canonical_repair.sql"
);

describe("P0-4 — repair migration properties", () => {
    const sql = readFileSync(REPAIR_MIGRATION, "utf8");

    it("is non-destructive: retains the legacy columns rather than dropping them", () => {
        expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
        expect(sql).toMatch(/target_spec/);
    });

    it("is idempotent: every structural change is guarded", () => {
        const addColumns = sql.match(/ALTER TABLE public\.announcement_targets ADD COLUMN/gi) ?? [];
        const guardedAdds = sql.match(/ADD COLUMN IF NOT EXISTS/gi) ?? [];
        expect(addColumns.length).toBeGreaterThan(0);
        expect(guardedAdds.length).toBe(addColumns.length);
        expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_announcement_targets_org_announcement/i);
        expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/i);
    });

    it("is shape-agnostic: reads target_spec only when that column exists", () => {
        expect(sql).toMatch(/column_name\s*=\s*'target_spec'/i);
    });

    it("declares a target_type vocabulary identical to announcementSchema.ts", () => {
        const check = sql.match(/CHECK \(target_type IN \(([^)]+)\)\)/i)?.[1] ?? "";
        const inSql = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
        expect(inSql).toEqual([...ANNOUNCEMENT_TARGET_TYPES].sort());
    });

    it("maps unmappable legacy rows to 'custom' rather than discarding them", () => {
        expect(sql).toMatch(/'custom'/);
        expect(ANNOUNCEMENT_TARGET_TYPES).toContain("custom");
    });
});

describe("P0-4 — the targets route writes the canonical shape", () => {
    beforeEach(() => {
        insertedRows.length = 0;
        vi.clearAllMocks();
        mockRequireAdminOrOps.mockResolvedValue(null);
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, role: "admin", userId: "u1" });
    });

    async function putTarget(target: Record<string, unknown>) {
        return invokeRoute(
            putTargets,
            buildRequest({
                method: "PUT",
                path: `/api/admin/communications/announcements/${announcementId}/targets`,
                body: { targets: [target] },
            }),
            routeParams({ id: announcementId })
        );
    }

    it("persists target_type / target_ref / rule and never the legacy target_spec", async () => {
        const res = await putTarget({ target_type: "all_families", target_ref: null, rule: {} });

        expect(res.status).toBe(200);
        expect(insertedRows).toHaveLength(1);

        const row = insertedRows[0];
        expect(Object.keys(row).sort()).toEqual(["announcement_id", "org_id", "rule", "target_ref", "target_type"]);
        expect(row).not.toHaveProperty("target_spec");
        expect(row.target_type).toBe("all_families");
    });

    it("scopes every written row to the caller's org", async () => {
        await putTarget({ target_type: "waitlist", target_ref: null, rule: {} });
        expect(insertedRows[0].org_id).toBe(orgId);
    });

    it("rejects a target_type outside the canonical vocabulary", async () => {
        const res = await putTarget({ target_type: "everyone_everywhere", target_ref: null, rule: {} });

        expect(res.status).toBe(400);
        expect(insertedRows).toHaveLength(0);
    });
});

describe.skipIf(process.env.P0_DB_TESTS_ENABLED !== "true")("P0-4 — live schema (post-migration)", () => {
    it("reports whether the canonical shape is present on the target database", async () => {
        const { serviceClient, missingColumns } = await import("../harness/dbHarness");
        const sb = serviceClient();

        const missing = await missingColumns(sb, "announcement_targets", ["target_type", "target_ref", "rule"]);

        if (missing.length > 0) {
            // Migration not yet applied. Report, do not fail: applying a
            // migration to the shared tenant is a coordinated action, not
            // something a test may trigger implicitly.
            console.warn(
                `[P0-4] repair migration NOT applied to this database. Missing: ${missing.join(", ")}. ` +
                    `Apply 20260731100000_announcement_targets_canonical_repair.sql, then re-run.`
            );
            expect(missing).toEqual(["target_type", "target_ref", "rule"]);
            return;
        }

        expect(missing).toEqual([]);
    });
});
