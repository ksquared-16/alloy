/**
 * Pre-apply invariants carry their pending migration byte for byte.
 *
 * A pre-apply invariant runs a held migration INSIDE `database.run_rollback_invariant_test`'s discarded transaction and
 * then asserts its behaviour, so the migration is proven on an isolated certenv without being applied. That proof is
 * only worth anything if what ran is exactly what will later be applied. This locks it: each invariant is the pending
 * migration (with only the substitution named below), the banner, then the assertions — and the atomic-open one ends in
 * the reviewed single-session invariant unchanged.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const BANNER = "\n-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════\n-- PRE-APPLY INVARIANT";

describe("pre-apply invariants", () => {
    it("D9.3 archive: the pending migration, unchanged, then the banner and assertions", () => {
        const migration = read("supabase/migrations/20261217090000_documents_d9_3_archive.sql");
        const invariant = read("certification/invariants/documents-d9-3-archive-preapply.sql");
        expect(invariant.startsWith(migration)).toBe(true);
        expect(invariant.slice(migration.length).startsWith(BANNER)).toBe(true);
        // The assertions never COMMIT and never apply: no ledger write, no transaction control.
        const tail = invariant.slice(migration.length);
        const code = tail.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
        expect(code).not.toMatch(/schema_migrations|\bCOMMIT\b|\bROLLBACK\b/i);
        expect(tail).toContain("tests passed=% failed=0");
    });

    it("D10-M1 verdict store: the pending migration with only GRANT EXECUTE → GRANT ALL, then the reviewed invariant unchanged", () => {
        const migration = read("supabase/migrations/20261219090000_documents_malware_verdicts.sql");
        const single = read("certification/invariants/documents-malware-verdicts.sql");
        const invariant = read("certification/invariants/documents-malware-verdicts-preapply.sql");
        expect(migration.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(3);
        const substituted = migration.split("GRANT EXECUTE ON FUNCTION").join("GRANT ALL ON FUNCTION");
        expect(invariant.startsWith(substituted)).toBe(true);
        expect(invariant.endsWith(single)).toBe(true);
        const banner = invariant.slice(substituted.length, invariant.length - single.length);
        expect(banner.startsWith(BANNER)).toBe(true);
        expect(banner.split("\n").every((l) => l === "" || l.startsWith("--"))).toBe(true);
    });

    it("D10 activation gates: the pending migration unchanged, then the banner, then rollback-only assertions", () => {
        const migration = read("supabase/migrations/20261220090000_documents_d10_activation_gates.sql");
        // Proven by gar_550ba1d16c11d8 (11/0, rollback verified, certenv at staging 98fdf5c9) at ac423e463. A byte change needs the proof again.
        expect(createHash("sha256").update(migration).digest("hex")).toBe("1196606e40ece37e73146bfa053fa3e4654a64be6a8a056ef9c9c2ba11a1032a");
        const single = read("certification/invariants/documents-d10-activation-gates.sql");
        const invariant = read("certification/invariants/documents-d10-activation-gates-preapply.sql");
        expect(migration).not.toMatch(/GRANT EXECUTE|REVOKE EXECUTE/);
        expect(invariant.startsWith(migration)).toBe(true);
        expect(invariant.endsWith(single)).toBe(true);
        const banner = invariant.slice(migration.length, invariant.length - single.length);
        expect(banner.startsWith(BANNER)).toBe(true);
        expect(banner.split("\n").every((l) => l === "" || l.startsWith("--"))).toBe(true);
        const code = single.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
        expect(code).not.toMatch(/schema_migrations|\bCOMMIT\b|\bROLLBACK\b/i);
        expect(single).toContain("tests passed=% failed=0");
    });

    it("D10-A1 atomic open: the pending migration with only GRANT EXECUTE → GRANT ALL, then the reviewed invariant unchanged", () => {
        const migration = read("supabase/migrations/20261215093000_processing_open_case_atomic.sql");
        const single = read("certification/invariants/processing-open-case-atomic.sql");
        const invariant = read("certification/invariants/processing-open-case-atomic-preapply.sql");
        expect(migration.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(1);
        const substituted = migration.replace("GRANT EXECUTE ON FUNCTION", "GRANT ALL ON FUNCTION");
        expect(invariant.startsWith(substituted)).toBe(true);
        expect(invariant.endsWith(single)).toBe(true);
        const banner = invariant.slice(substituted.length, invariant.length - single.length);
        expect(banner.startsWith(BANNER)).toBe(true);
        expect(banner.split("\n").every((l) => l === "" || l.startsWith("--"))).toBe(true);
    });

    it("W-C1 audit linkage: the pending migration TWICE (T10 idempotent re-apply), then the banner, then the invariant unchanged", () => {
        const migration = read("supabase/migrations/20261222090000_documents_w_c1_audit_linkage.sql");
        const single = read("certification/invariants/documents-w-c1-audit-linkage.sql");
        const invariant = read("certification/invariants/documents-w-c1-audit-linkage-preapply.sql");
        expect(invariant.startsWith(migration + migration)).toBe(true);
        expect(invariant.endsWith(single)).toBe(true);
        const banner = invariant.slice(2 * migration.length, invariant.length - single.length);
        expect(banner.startsWith(BANNER)).toBe(true);
        expect(banner.split("\n").every((l) => l === "" || l.startsWith("--"))).toBe(true);
        // The rollback executor refuses the bare word EXECUTE as dynamic SQL: grants are GRANT ALL ON FUNCTION.
        expect(migration).not.toMatch(/GRANT EXECUTE/);
        const code = single.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
        expect(code).not.toMatch(/schema_migrations|\bCOMMIT\b|\bROLLBACK\b/i);
        expect(single).toContain("tests passed=% failed=0");
    });
});
