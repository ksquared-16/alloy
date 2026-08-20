import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W-43 Tier A (`02…§19`, `RL-23`) — *"no Supabase call in the resolution path destructures `data`
 * without `error`."*
 *
 * The behavioural suite (`resolverReadFailureDenies.test.ts`) proves each read denies TODAY. This
 * proves the next read added to this module cannot quietly reintroduce the shape: an undestructured
 * error is invisible at the call site, which is exactly how `user_access_profiles` stayed the widest
 * fail-open in the resolver while four sibling reads handled their errors.
 *
 * The subject is DISCOVERED from source rather than enumerated. An enumerated list of reads is a
 * list that a newly added read is absent from — the failure shape W-5's locks and session 3's
 * backing-route record already paid for in this initiative.
 */

/**
 * BOTH resolver modules. `resolveAdminPortalOrgCore` carries a byte-for-byte duplicate of the
 * legacy admin/ops grant path; `W-41` owns removing the duplication, so until then the copies are
 * held together by this scan rather than by anyone remembering they exist.
 */
const RESOLVER_MODULES = [
    "lib/admin/resolveAdminAccessCore.ts",
    "lib/admin/resolveAdminPortalOrgCore.ts",
] as const;

const RESOLVER = join(process.cwd(), RESOLVER_MODULES[0]);

/** Every `const { … } = await supabase…` destructuring in the file, with its line number. */
function supabaseDestructurings(source: string): { line: number; text: string }[] {
    const lines = source.split("\n");
    const found: { line: number; text: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /const\s*\{([^}]*)\}\s*=\s*await\s+supabase\b/.exec(lines[i]);
        if (!m) continue;
        found.push({ line: i + 1, text: m[1] });
    }
    // Multi-line form: `const { data: x, error: y } = await supabase` split across lines is the
    // dominant style here, so also match a destructuring whose `= await supabase` lands later.
    const joined = source.replace(/\n\s*/g, " ");
    const multi = joined.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+supabase\b/g);
    for (const m of multi) {
        const text = m[1];
        if (!found.some((f) => f.text.replace(/\s+/g, " ").trim() === text.replace(/\s+/g, " ").trim())) {
            found.push({ line: 0, text });
        }
    }
    return found;
}

describe.each(RESOLVER_MODULES)("W-43 Tier A — %s destructures every read's error", (relPath) => {
    const source = readFileSync(join(process.cwd(), relPath), "utf8");

    it("finds the reads it is supposed to be checking (the scan is not vacuous)", () => {
        // The floor was four, sized when both resolvers carried the legacy fallback's three reads.
        // `W-20` deleted them, and `resolveAdminPortalOrgCore` is down to its single `user_roles`
        // read — so a floor of four now convicts the module for having LESS to get wrong.
        //
        // One is the honest floor: the property is that the scan found something to check, and it
        // is deliberately not an equality, because pinning the count makes every future read a test
        // edit rather than a fact about coverage.
        const reads = supabaseDestructurings(source);
        expect(reads.length, `${relPath} has no destructured reads at all`).toBeGreaterThanOrEqual(1);
    });

    it("no `await supabase` destructuring takes `data` without `error`", () => {
        const offenders = supabaseDestructurings(source).filter(
            (r) => /\bdata\b/.test(r.text) && !/\berror\b/.test(r.text)
        );
        expect(
            offenders.map((o) => `line ${o.line}: { ${o.text.trim()} }`),
            "a read whose error is not destructured cannot fail closed on purpose — W-43 (I-30ᴬ)"
        ).toEqual([]);
    });
});

describe("W-43 Tier A — the scan bites", () => {
    const source = readFileSync(RESOLVER, "utf8");

    it("bites: a `data`-only destructuring is detected", () => {
        const regressed = source.replace(
            /const \{ data: profileRow, error: profileErr \} = await supabase/,
            "const { data: profileRow } = await supabase"
        );
        expect(regressed).not.toBe(source);
        const offenders = supabaseDestructurings(regressed).filter(
            (r) => /\bdata\b/.test(r.text) && !/\berror\b/.test(r.text)
        );
        expect(offenders.length).toBeGreaterThan(0);
    });
});
