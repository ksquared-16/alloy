/**
 * FINANCIAL TENANT SCOPE — service-role mutations must constrain organization identity.
 *
 * ── THE DEFECT THIS EXISTS FOR ──
 *
 * `admin/pricing/matrix/[id]` PATCH ran `createAdminClient().update(...).eq("id", id)` and nothing
 * else. That client is service-role, so RLS enforces nothing, and matching on `id` alone let a
 * principal in one organization rewrite another organization's price by knowing its row id. The
 * capability gate added in the same slice answers "may this principal configure money?" — it cannot
 * answer "may they configure THIS tenant's money", and a reviewer reading only the capability would
 * have believed the route safe.
 *
 * So the invariant is about the second question, and it is deliberately narrow: within the audited
 * Financials mutation surface, a service-role write to an ORG-OWNED table must name the organization.
 *
 * ── WHY AN ALLOWLIST RATHER THAN A CLEANER RULE ──
 *
 * Two pricing tables genuinely have no tenant column anywhere in their lineage — not on the row, not
 * on its service, vertical, tier or frequency. They are platform-global reference data, so there is
 * no organization to name and a rule demanding one would be unsatisfiable. They are listed by name,
 * with that reason, rather than excluded by a pattern that would also hide a real escape. Their
 * product disposition is recorded separately as LEGACY_PRICING_SURFACE_DEBT.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join, resolve } from "node:path";

const webRoot = resolve(__dirname, "../..");

/** The audited Financials mutation surface. Bounded on purpose — this is not a repository-wide scan. */
const SURFACE = [
    "app/api/admin/commercial/**/route.ts",
    "app/api/admin/financial/**/route.ts",
    "app/api/admin/financials/**/route.ts",
    "app/api/admin/pricing/**/route.ts",
    "app/api/admin/pricing-dimensions/**/route.ts",
    "app/api/admin/pricing-dimension-values/**/route.ts",
    "app/api/admin/pricing-modes/**/route.ts",
    "app/api/admin/payments/**/route.ts",
];

/**
 * Tables with no tenant column in their lineage. Platform-global reference data, so "constrain the
 * organization" has no meaning for them. Adding a table here is a claim that it has NO org_id; if one
 * is ever added, this list is wrong and the entry must go.
 */
const GLOBAL_BY_DESIGN = new Set(["pricing_first_clean_prices", "pricing_recurring_prices"]);

const MUTATION = /\.(update|delete|upsert|insert)\(/;

function files(): string[] {
    const out: string[] = [];
    for (const pattern of SURFACE) {
        for (const f of globSync(pattern, { cwd: webRoot })) out.push(join(webRoot, f));
    }
    return [...new Set(out)];
}

/**
 * Each `.from("table")` chain, with text on BOTH sides of it.
 *
 * The window reaches backwards on purpose. An insert names its organization in the row object, and
 * that object is built before the chain — `const insert = { org_id: ctx.orgId, ... }` then
 * `.from(t).insert(insert)`. A forward-only window reports every one of those as an unconstrained
 * write, which is how the first draft of this lock produced ten false offenders and hid the six real
 * ones inside the noise.
 */
function chains(src: string): { table: string; block: string }[] {
    const found: { table: string; block: string }[] = [];
    const re = /\.from\("(\w+)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
        found.push({ table: m[1], block: src.slice(Math.max(0, m.index - 700), m.index + 600) });
    }
    return found;
}

describe("Financial tenant scope — a capability is not a tenant boundary", () => {
    it("scans a surface that actually contains the repaired route (non-vacuity)", () => {
        const scanned = files();
        expect(scanned.length, "the Financials surface glob matched nothing — the lock would pass vacuously")
            .toBeGreaterThan(20);
        expect(
            scanned.some((f) => f.includes(join("pricing", "matrix", "[id]"))),
            "pricing/matrix/[id] is the route this lock was written for; if it moved, the lock must follow it",
        ).toBe(true);
    });

    it("every service-role mutation of an org-owned Financial table names the organization", () => {
        const offenders: string[] = [];
        for (const file of files()) {
            const src = readFileSync(file, "utf8");
            if (!src.includes("createAdminClient")) continue;
            const scopedByHelper = src.includes("assertRowOrg");
            for (const { table, block } of chains(src)) {
                if (!MUTATION.test(block)) continue;
                if (GLOBAL_BY_DESIGN.has(table)) continue;
                const namesOrg = block.includes("org_id") || scopedByHelper;
                if (!namesOrg) offenders.push(`${file.replace(webRoot + "/", "")} -> ${table}`);
            }
        }
        expect(offenders, "a service-role write that does not name the organization is a cross-tenant write").toEqual([]);
    });

    it("the repaired route constrains both the row and its organization", () => {
        const src = readFileSync(join(webRoot, "app/api/admin/pricing/matrix/[id]/route.ts"), "utf8");
        expect(src).toContain('.eq("id", id)');
        expect(
            src,
            "pricing_matrix.org_id is NOT NULL and keyed to orgs; dropping this predicate reopens the escape",
        ).toContain('.eq("org_id", ctx.orgId)');
    });
});
