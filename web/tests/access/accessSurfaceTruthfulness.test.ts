/**
 * W-45 / W-47 (tier A, discovered subject) — `RL-33` and `RL-34`.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * `06…§7` names two checks, and this file is both:
 *
 *   `RL-33` — no literal `Active` / `Password` in a **status position** under
 *             `components/adminV2/settings/access/**`.
 *   `RL-34` — **no projection defaults a missing access profile to `all`.**
 *
 * **What "status position" means here, and why it is not "anywhere in the file".** `Password` is a
 * legitimate word in a method *catalogue* — the Security chapter lists it beside `Available`,
 * `Planned`, `Planned` — and a check that banned the substring would be satisfied by renaming the
 * row. The subject is a **JSX text node**: `>Active<`. That is the shape all four `IA-1`
 * assertions had, and it is the shape a projection value never has.
 *
 * **Exemptions are declared with a reason, never by narrowing the pattern.** W-14 established the
 * idiom: `none` requires a stated reason of substance, which is what makes an absence auditable.
 * A file quietly dropped from the glob is how a census stops meaning anything.
 *
 * **The subject is discovered from disk.** A fifth Access chapter added tomorrow is checked
 * tomorrow. `RL-1`, `RL-4` and `RL-11` were each defeated by an enumerated subject.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const ACCESS_COMPONENTS = path.join(REPO_ROOT, "web/components/adminV2/settings/access");
const MEMBERS_ROUTE = path.join(REPO_ROOT, "web/app/api/admin/settings/users-roles/members/route.ts");

/**
 * Words that assert a state. `All locations` / `All departments` are here because `IA-3` is the
 * same defect in scope's clothing: they were rendered for a membership whose profile was never
 * created.
 */
const STATUS_LITERALS = ["Active", "Password", "All locations", "All departments", "Password sign-in"];

/**
 * Declared exemptions. Key is `<file>:<literal>`; the value must say why the literal is not a
 * state assertion, in at least 40 characters. Same contract as W-14's `status: "none"`.
 */
const EXEMPT: Record<string, string> = {
    "AccessSecurityPage.tsx:Password":
        "Organization-level catalogue of authentication METHODS, not a per-user state. The row's own " +
        "status word is the adjacent 'Available' pill, and the three unbuilt methods beside it carry " +
        "data-capability='planned'.",
    "AccessRolesConfigurationPage.tsx:Active":
        "Role definition activation, read from role_definitions.is_active and rendered beside its " +
        "'Inactive' counterpart. 06…§4.1 cites the Roles chapter as the internal comparison that makes " +
        "the Users chapter a defect: 'Roles read; Users assert.'",
};

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

/** JSX text nodes: the content between `>` and `<` with no tag or brace of its own. */
function jsxTextNodes(source: string): string[] {
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    return [...stripped.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!.trim()).filter((t) => t.length > 0);
}

export function findStatusLiteralViolations(files: string[]): { file: string; literal: string }[] {
    const violations: { file: string; literal: string }[] = [];
    for (const file of files) {
        const base = path.basename(file);
        for (const text of jsxTextNodes(fs.readFileSync(file, "utf8"))) {
            for (const literal of STATUS_LITERALS) {
                if (text !== literal) continue;
                const reason = EXEMPT[`${base}:${literal}`];
                if (reason && reason.trim().length >= 40) continue;
                violations.push({ file: path.relative(REPO_ROOT, file), literal });
            }
        }
    }
    return violations;
}

describe("RL-33 — no Access surface renders a state it did not read", () => {
    const files = walk(ACCESS_COMPONENTS);

    it("discovers the Access chapter components from disk", () => {
        // Non-vacuity: a glob that matches nothing passes every assertion below it.
        expect(files.length).toBeGreaterThanOrEqual(5);
        expect(files.map((f) => path.basename(f))).toContain("AccessUsersConfigurationPage.tsx");
    });

    it("no status literal is a JSX text node", () => {
        expect(findStatusLiteralViolations(files)).toEqual([]);
    });

    it("FAILS for a reintroduced literal — the check is not vacuous", () => {
        const fixture = path.join(
            fs.mkdtempSync(path.join(require("node:os").tmpdir(), "rl33-")),
            "Regression.tsx",
        );
        fs.writeFileSync(fixture, `export const X = () => <span className="s">Active</span>;\n`);
        try {
            const found = findStatusLiteralViolations([fixture]);
            expect(found).toHaveLength(1);
            expect(found[0]!.literal).toBe("Active");
        } finally {
            fs.rmSync(path.dirname(fixture), { recursive: true, force: true });
        }
    });

    it("every declared exemption states a substantive reason", () => {
        for (const [key, reason] of Object.entries(EXEMPT)) {
            expect(reason.trim().length, `exemption ${key} has no substantive reason`).toBeGreaterThanOrEqual(40);
        }
    });

    it("exemptions are live — a stale one would silently license a future literal", () => {
        const basenames = new Set(files.map((f) => path.basename(f)));
        for (const key of Object.keys(EXEMPT)) {
            expect(basenames, `exemption ${key} names a file that no longer exists`).toContain(key.split(":")[0]!);
        }
    });

    it("the Users chapter renders lifecycle and authentication from the projection", () => {
        const source = fs.readFileSync(path.join(ACCESS_COMPONENTS, "AccessUsersConfigurationPage.tsx"), "utf8");
        // Not "it contains no literal" — that is satisfiable by rendering nothing. It must read.
        expect(source).toContain("@/lib/access/memberIdentityProjection");
        expect(source).toContain("MEMBER_LIFECYCLE_LABEL");
        expect(source).toContain("authenticationMethodLabel");
    });
});

describe("RL-34 — no projection defaults a missing access profile to `all`", () => {
    /**
     * The exact shape the members route carried: `prof?.department_scope ?? "all"`. `01…§31` row 6
     * calls it *"the fail-open in GAP-3, rendered as a reassurance."* Scanned across every API
     * route and every access library, discovered from disk — not just the one file it was found in.
     */
    const SCOPE_DEFAULT = /\b(?:department_scope|site_scope)\b[^;\n]{0,80}\?\?\s*["']all["']/;

    const subject = [
        ...walk(path.join(REPO_ROOT, "web/app/api/admin")),
        ...walk(path.join(REPO_ROOT, "web/lib/access")),
    ];

    /**
     * A coercion this check cannot itself distinguish from the fail-open, declared with the
     * distinction stated. Reasons are ≥40 characters, per W-14's contract for `status: "none"`.
     *
     * The alternative — narrowing the pattern until these stop matching — is how a census stops
     * meaning anything. The pattern stays blunt; the exceptions stay written down.
     */
    const EXEMPT_SCOPE_DEFAULT: Record<string, string> = {
        "web/app/api/admin/access-scope-debug/route.ts":
            "The coercion is inside a `profile ? {…} : null` ternary, so an ABSENT row is already " +
            "reported as null and is not the input. What it defaults is a PRESENT row with a NULL " +
            "column, which is exactly what resolveScopeAnswerFromProfile does — presentation agreeing " +
            "with enforcement, not overriding it.",
    };

    it("scans a non-empty subject", () => {
        expect(subject.length).toBeGreaterThan(50);
    });

    it("no scanned source coerces an absent scope to `all`", () => {
        // Comments are stripped first. This module's own prose quotes the removed expression, and
        // a scan that counted prose would make the lesson unwriteable — the same shape as the
        // `lib/trust` boundary scan that could not tolerate the word `fetch(` in a docstring.
        const offenders = subject
            .filter((f) => {
                const stripped = fs
                    .readFileSync(f, "utf8")
                    .replace(/\/\*[\s\S]*?\*\//g, " ")
                    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
                return SCOPE_DEFAULT.test(stripped);
            })
            .map((f) => path.relative(REPO_ROOT, f))
            .filter((rel) => (EXEMPT_SCOPE_DEFAULT[rel]?.trim().length ?? 0) < 40);
        expect(offenders).toEqual([]);
    });

    it("every scope-default exemption is live and reasoned", () => {
        for (const [rel, reason] of Object.entries(EXEMPT_SCOPE_DEFAULT)) {
            expect(reason.trim().length, `${rel} has no substantive reason`).toBeGreaterThanOrEqual(40);
            expect(fs.existsSync(path.join(REPO_ROOT, rel)), `${rel} no longer exists`).toBe(true);
            // A file that no longer matches must lose its exemption, or the next regression there
            // is licensed in advance.
            const stripped = fs
                .readFileSync(path.join(REPO_ROOT, rel), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, " ")
                .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
            expect(SCOPE_DEFAULT.test(stripped), `${rel} no longer matches; delete its exemption`).toBe(true);
        }
    });

    it("FAILS for the exact expression that was removed — the check is not vacuous", () => {
        expect(SCOPE_DEFAULT.test(`const department_scope = prof?.department_scope ?? "all";`)).toBe(true);
        expect(SCOPE_DEFAULT.test(`const site_scope = prof?.site_scope ?? "all";`)).toBe(true);
    });

    it("the members projection can express `unset`, and reports what is enforced beside it", () => {
        const source = fs.readFileSync(MEMBERS_ROUTE, "utf8");
        expect(source).toContain("has_access_profile");
        expect(source).toContain("effective_site_scope");
        expect(source).toContain("effective_divergence_reason");
    });
});
