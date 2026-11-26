/**
 * `I-35`ᴮ (W-13's exit clause) — **an admission predicate MUST NOT satisfy a capability gate.**
 *
 * `04…:752`: if `AD-22` is only half-answered, *"the fifth layer survives under a new name."* That is
 * what this locks. `portalEligible` is an ADMISSION fact — is this principal allowed through the
 * front door of the operator portal — and `A2-8` records it as a fifth authority layer precisely
 * because two gates accepted it as an ANSWER rather than as a filter.
 *
 * **The distinction this file exists to hold, and the reason a naive scan gets it wrong.** These two
 * are not the same statement:
 *
 *     if (!portalEligible) return forbidden;   // admission DENIES  — legal, and common
 *     if (portalEligible)  return true;        // admission AUTHORIZES — the I-35ᴮ violation
 *
 * A check that simply grepped for `portalEligible` would convict eleven correct call sites and the
 * one real defect equally. So the scan is polarity-aware: it looks for the AFFIRMATIVE form that
 * grants, and ignores the negated form that refuses. That is the same lesson `RL-41` and the
 * public-form lock record from the other side — a scan that cannot tell what it matched is not
 * evidence.
 *
 * The last violation was `canReadAnalytics.ts`, which opened `if (subject.portalEligible) return
 * true`. Its own comment had said since it was written that the leg *"is what W-13 replaces"*. It
 * was removed with `20260819120000` granting `ops` the `reports.read` key first, so no principal
 * admitted by the leg lost access.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const webRoot = join(__dirname, "..", "..");

/** Comments stripped — a doc comment describing the removed leg must not convict its own file. */
function executableSource(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(entry)) out.push(p);
        }
    };
    walk(join(webRoot, dir));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

/**
 * Admission predicates — facts about being let in, which must never by themselves grant.
 * Enumerated because the vocabulary is small and named; the SITES are discovered.
 */
const ADMISSION_PREDICATES = ["portalEligible"] as const;

/**
 * An affirmative admission grant: the predicate tested positively, returning/yielding truth.
 * Deliberately does NOT match `if (!portalEligible)`, which is a refusal.
 */
function admissionAuthorizes(src: string, predicate: string): string[] {
    const hits: string[] = [];
    // `if (x.portalEligible) return true` / `if (portalEligible) return true`
    const affirmativeReturn = new RegExp(
        String.raw`if\s*\(\s*(?:[A-Za-z_$][\w$]*\.)?${predicate}\s*\)\s*(?:\{\s*)?return\s+true`,
        "g",
    );
    // `return portalEligible || …` — admission short-circuiting a capability check.
    const affirmativeDisjunct = new RegExp(
        String.raw`return\s+(?:[A-Za-z_$][\w$]*\.)?${predicate}\s*\|\|`,
        "g",
    );
    for (const re of [affirmativeReturn, affirmativeDisjunct]) {
        for (const m of src.matchAll(re)) hits.push(m[0].replace(/\s+/g, " "));
    }
    return hits;
}

const PRODUCT_TREES = ["app", "lib"];

describe("I-35ᴮ — admission may deny, never authorize", () => {
    it("the scan finds admission predicates at all — non-vacuity on the WALK", () => {
        // If nothing mentions `portalEligible`, the assertion below passes by agreeing with nothing.
        const mentioning = PRODUCT_TREES.flatMap(sourceFilesUnder).filter((rel) =>
            ADMISSION_PREDICATES.some((p) => executableSource(rel).includes(p)),
        );
        expect(mentioning.length).toBeGreaterThanOrEqual(5);
    });

    it("no gate is satisfied by an admission predicate", () => {
        const offenders: string[] = [];
        for (const rel of PRODUCT_TREES.flatMap(sourceFilesUnder)) {
            const src = executableSource(rel);
            for (const predicate of ADMISSION_PREDICATES) {
                for (const hit of admissionAuthorizes(src, predicate)) {
                    offenders.push(`${rel}: ${hit}`);
                }
            }
        }
        expect(
            offenders,
            "I-35ᴮ: an admission predicate must not satisfy a capability gate — resolve the capability "
                + "instead, and grant it first so the change preserves admission rather than narrowing it",
        ).toEqual([]);
    });

    it("admission still DENIES in the places that should refuse — the fix did not delete the guard", () => {
        // The failure mode opposite to the one above: "fixing" I-35ᴮ by removing the predicate
        // everywhere would open the portal rather than close the fifth layer.
        // Matches the negated form wherever it appears in a condition, including
        // `!bundle.ok || !bundle.portalEligible` and the optional-chained `!core?.portalEligible`.
        const denying = PRODUCT_TREES.flatMap(sourceFilesUnder).filter((rel) =>
            /!\s*(?:[A-Za-z_$][\w$]*\??\.)?portalEligible\b/.test(executableSource(rel)),
        );
        expect(denying.length, "no site refuses on admission any more — that is not the fix").toBeGreaterThanOrEqual(4);
    });

    it("the analytics gate resolves a capability, and carries admission without consulting it", () => {
        const src = executableSource("lib/admin/canReadAnalytics.ts");
        expect(src).toMatch(/ANALYTICS_READ_PERMISSION/);
        expect(src).toMatch(/permissionKeys\.includes/);
        expect(admissionAuthorizes(src, "portalEligible")).toEqual([]);
    });

    it("the capability the fix relies on is granted before the code stops admitting", () => {
        // Preservation, not narrowing. The grant migration must exist and must cover `ops`, or
        // removing the leg silently removes analytics from every ops operator.
        const migrations = readdirSync(join(webRoot, "..", "supabase", "migrations"))
            .filter((f) => f.includes("i35b_analytics_read_preservation"));
        expect(migrations, "the preservation migration is missing").toHaveLength(1);
        const sql = readFileSync(join(webRoot, "..", "supabase", "migrations", migrations[0]), "utf8");
        expect(sql).toMatch(/'reports\.read'/);
        expect(sql).toMatch(/role_key\s*=\s*'ops'/);
        // It grants the READ key only — `reports.write` would widen, and a preservation migration
        // that widens is not a preservation migration.
        expect(sql).not.toMatch(/INSERT[\s\S]*'reports\.write'/i);
        // And it aborts rather than warns if any org is left uncovered.
        expect(sql).toMatch(/RAISE\s+EXCEPTION/i);
    });

    /* ------------------------------------------------------------- non-vacuity */

    it("bites: the affirmative form is convicted", () => {
        for (const fixture of [
            "if (subject.portalEligible) return true;",
            "if (portalEligible) { return true; }",
            "return portalEligible || permissionKeys.includes(K);",
        ]) {
            expect(admissionAuthorizes(fixture, "portalEligible").length, fixture).toBeGreaterThan(0);
        }
    });

    it("acquits: the negated form is NOT convicted", () => {
        // The whole reason this scan is polarity-aware. Eleven correct sites use these shapes.
        for (const fixture of [
            "if (!portalEligible) return forbidden();",
            "if (!bundle.portalEligible) { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }",
            "const { portalEligible, ...access } = bundle;",
            "portalEligible: boolean;",
        ]) {
            expect(admissionAuthorizes(fixture, "portalEligible"), fixture).toEqual([]);
        }
    });

    it("the scan reads code, not prose", () => {
        // Proved on the STRIPPER against an input built for the purpose. Asserting that this file is
        // clean would be wrong — it deliberately holds affirmative fixtures as CODE, in the two
        // tests above, and those are exactly what must still be matched.
        const fixture = [
            "/** the old shape was: if (subject.portalEligible) return true; */",
            "// also: return portalEligible || x;",
            "if (!bundle.portalEligible) return forbidden();",
        ].join("\n");
        const stripped = fixture
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/^\s*\/\/.*$/gm, " ");
        expect(
            admissionAuthorizes(stripped, "portalEligible"),
            "a violating shape that exists only in a comment must not be convicted",
        ).toEqual([]);
        // …while the same shapes in code still are.
        expect(admissionAuthorizes("if (subject.portalEligible) return true;", "portalEligible").length)
            .toBeGreaterThan(0);
    });
});
