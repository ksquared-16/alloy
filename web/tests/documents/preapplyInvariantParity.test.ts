/**
 * Pre-apply invariants carry their pending migration byte for byte.
 *
 * A pre-apply invariant runs a held migration INSIDE `database.run_rollback_invariant_test`'s discarded transaction and
 * then asserts its behaviour, so the migration is proven on an isolated certenv without being applied. That proof is
 * only worth anything if what ran is exactly what will later be applied. This locks it: each invariant is the pending
 * migration (with only the substitution named below), the banner, then the assertions — and the atomic-open one ends in
 * the reviewed single-session invariant unchanged.
 */
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
        const migration = read("certification/documents-v1/pending-migrations/20261216090000_documents_malware_verdicts.sql");
        const single = read("certification/invariants/documents-malware-verdicts.sql");
        const invariant = read("certification/invariants/documents-malware-verdicts-preapply.sql");
        expect(migration.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(2);
        const substituted = migration.split("GRANT EXECUTE ON FUNCTION").join("GRANT ALL ON FUNCTION");
        expect(invariant.startsWith(substituted)).toBe(true);
        expect(invariant.endsWith(single)).toBe(true);
        const banner = invariant.slice(substituted.length, invariant.length - single.length);
        expect(banner.startsWith(BANNER)).toBe(true);
        expect(banner.split("\n").every((l) => l === "" || l.startsWith("--"))).toBe(true);
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
});
