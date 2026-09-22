/**
 * ACTIVE LEADS resolves through the canonical count, not the materialized projection.
 *
 * The old path loaded the whole enrollment participant projection (5-6 sequential reads, every row
 * into memory) to produce one integer — ~838ms on deployed staging, ~80% of the header's metric
 * work. These gates hold the three things that could quietly undo that: the projection creeping
 * back onto the count path, the alias drifting from the canonical key, and a database failure
 * being reported as zero leads.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const METRICS = codeOf(read("lib/metrics/resolvers/enrollmentParticipantMetrics.ts"));
const MIGRATION = read("../supabase/migrations/20260921140000_active_lead_participation_count.sql");
/*
 * Negative assertions must read SQL, not prose. The migration's own commentary explains why it is
 * not SECURITY DEFINER and why COUNT(DISTINCT …) would be the wrong grain — and those explanations
 * tripped the very gates that forbid them. Strip `--` comments for the "must not contain" checks.
 */
const MIGRATION_SQL = MIGRATION.replace(/^\s*--.*$/gm, "");

/** The canonical resolver body only — a mention elsewhere in the file proves nothing. */
const CANON = (() => {
    const start = METRICS.indexOf("async function resolveActiveLeadCountCanonical");
    const bodyStart = METRICS.indexOf("{", METRICS.indexOf("): Promise<ResolvedMetricValue> {", start));
    let depth = 0;
    for (let i = bodyStart; i < METRICS.length; i++) {
        if (METRICS[i] === "{") depth++;
        else if (METRICS[i] === "}") { depth--; if (depth === 0) return METRICS.slice(start, i + 1); }
    }
    return "";
})();

describe("the count path no longer materializes the projection", () => {
    it("active leads resolves through the canonical count operation", () => {
        expect(CANON.length).toBeGreaterThan(0);
        expect(CANON).toContain('ctx.supabase.rpc("count_active_lead_participations"');
    });

    it("the projection does NOT execute on the count path", () => {
        // `enrollmentProjection.load` is what cost 5-6 sequential reads for one integer.
        expect(CANON).not.toContain("enrollmentProjection.load");
        expect(CANON).not.toContain("countActiveLeadParticipants");
    });

    it("active_leads and lead_count share ONE implementation", () => {
        expect(METRICS).toMatch(/resolveEnrollmentActiveLeads[\s\S]{0,200}resolveActiveLeadCountCanonical\(ctx, "enrollment\.active_leads"\)/);
        expect(METRICS).toMatch(/resolveActiveLeadCountCanonical\(ctx, "enrollment\.lead_count"\)/);
        // No parallel fast variant.
        for (const banned of ["fastActiveLeads", "activeLeadsV2", "activeLeadsFast"]) {
            expect(METRICS).not.toContain(banned);
        }
    });

    it("the OTHER participant metrics keep the projection — only this count moved", () => {
        // active_families / new_leads / waitlisted were not part of the proven equivalence.
        expect(METRICS).toContain("resolveParticipantMetric(ctx, \"enrollment.active_families\"");
        expect(METRICS).toContain("resolveParticipantMetric(ctx, \"enrollment.new_leads\"");
    });
});

describe("failure semantics: unavailable is never zero", () => {
    it("a database error throws rather than reporting no leads", () => {
        expect(CANON).toMatch(/if \(error\) throw new Error\(/);
        // The only `value: 0` permitted is the pre-existing impossible-scope branch, which is an
        // authorization outcome the projection path already returned.
        const errorBranch = CANON.slice(CANON.indexOf("const { data, error }"));
        expect(errorBranch).not.toMatch(/value:\s*0/);
    });

    it("a non-numeric result is refused, not coerced to zero", () => {
        expect(CANON).toContain("Number.isFinite(value)");
    });

    it("request-time authorization stays outside the count", () => {
        expect(CANON).toContain("resolveMetricScopeFilter(");
        for (const banned of ["canView", "allowedLocationIds", "permissionKeys"]) {
            expect(CANON).not.toContain(banned);
        }
    });
});

describe("the migrated function encodes the frozen contract", () => {
    it("is SECURITY INVOKER, not a privilege", () => {
        const fnDef = MIGRATION_SQL.slice(
            MIGRATION_SQL.indexOf("CREATE OR REPLACE FUNCTION"),
            MIGRATION_SQL.indexOf("AS $$"),
        );
        expect(fnDef).toContain("SECURITY INVOKER");
        expect(fnDef).not.toContain("SECURITY DEFINER");
    });

    it("counts participations, never distinct members or opportunities", () => {
        expect(MIGRATION_SQL).toMatch(/SELECT count\(\*\)::integer/);
        expect(MIGRATION_SQL).not.toMatch(/count\(DISTINCT/i);
    });

    it("keeps every frozen predicate", () => {
        for (const rule of [
            "pi.process_key = 'enrollment'",
            "pi.subject_type = 'child'",
            "pi.close_reason_key IS NULL",
            "COALESCE(cm.is_active, true) IS NOT FALSE",
            "'closed', 'lost', 'archived', 'inactive'",
            "'enrolled', 'withdrawn', 'not_enrolling'",
            "w2.department_id",
        ]) {
            expect(MIGRATION, `frozen rule missing: ${rule}`).toContain(rule);
        }
    });

    it("a NULL state COUNTS — the predicate must not require a state", () => {
        /*
         * 277 staging participations have a NULL state and the oracle counts every one. The
         * COALESCE(..., '') is what lets NULL through; a `state IS NOT NULL` guard would silently
         * drop them. This gate exists because a plant that added exactly that guard stayed green
         * against the earlier assertion, which only checked the terminal-state list was present.
         */
        expect(MIGRATION_SQL).toMatch(/COALESCE\(lower\(btrim\(pi\.state\)\), ''\) NOT IN/);
        expect(MIGRATION_SQL).not.toMatch(/pi\.state IS NOT NULL/);
    });

    it("the count is not gated on a state being present at all", () => {
        const where = MIGRATION_SQL.slice(MIGRATION_SQL.indexOf("WHERE pi.org_id"), MIGRATION_SQL.indexOf("COMMENT ON FUNCTION"));
        expect(where.length).toBeGreaterThan(0);
        expect(where).not.toMatch(/pi\.state\s+IS NOT NULL/);
    });

    it("resolves BOTH context anchors", () => {
        // Dropping the COALESCE silently loses every participation-anchored journey.
        expect(MIGRATION).toMatch(/o\.id = COALESCE\([\s\S]{0,220}m\.id = pi\.context_id[\s\S]{0,60}pi\.context_id\)/);
    });

    it("carries a self-test that leaves no durable specimen", () => {
        expect(MIGRATION).toContain("SELFTEST_CLEANUP");
        expect(MIGRATION).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    });
});
