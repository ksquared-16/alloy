/**
 * W-44 (`I-9`, `M2-6`) — the never-seeded role vocabulary is gone from authority decisions.
 *
 * `02…§8` records `M2-6`: `owner` and `manager` *"leaked from RLS into application code"*. They are
 * not roles the product can assign — no migration ever inserts them into `role_definitions`, and the
 * only roles that are inserted are `admin`, `ops`, `regional_lead` and `school_director`.
 *
 * **Why retiring them is provably a no-op, and why that is what OD-7 released.** OD-7 permits a
 * conversion only when it does not widen admission, and removing a disjunct can only shrink the
 * accepted set. Here the shrunk-away set is EMPTY: no principal can hold `owner` or `manager`.
 *
 * That was an observation about seed data until `W-16`. It is now structural: `user_roles.role` is
 * foreign-keyed to `role_definitions(org_id, role_key)` with `ON DELETE RESTRICT`, so a membership
 * naming a role nobody defined cannot be inserted at all — the database refuses it. A branch testing
 * for such a role is unreachable by construction, not merely unused today.
 *
 * **The SQL half is NOT this workstream's.** `has_org_role(…, 'owner')` in RLS policies is `AD-4`,
 * which OD-7 explicitly does not resolve. This file scans application code only, and asserts the
 * separation rather than assuming a reader will observe it.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const webRoot = join(__dirname, "..", "..");
const migrationsDir = join(webRoot, "..", "supabase", "migrations");

/** Roles the product can actually assign. */
const ASSIGNABLE = ["admin", "ops", "regional_lead", "school_director"] as const;
/** Roles that exist only in RLS text and never as a `role_definitions` row. */
const NEVER_SEEDED = ["owner", "manager"] as const;

function code(rel: string): string {
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
 * A role literal used in an AUTHORITY decision — compared against a role, or membership-tested
 * against a role collection. Deliberately narrow: `focusTier === "manager"` is a canvas zoom tier,
 * not a role, and convicting it would be the string-coincidence failure this program keeps paying
 * for.
 */
function authorityRoleLiterals(src: string, role: string): string[] {
    const hits: string[] = [];
    for (const re of [
        new RegExp(String.raw`\brole\w*\s*(?:!==|===)\s*["'\`]${role}["'\`]`, "g"),
        // `["owner","admin"].includes(ctx.role)` — the object prefix is required, because that is the
        // shape the real routes used and an earlier version of this pattern missed it entirely.
        new RegExp(String.raw`\[[^\]\n]*["'\`]${role}["'\`][^\]\n]*\]\s*\.\s*includes\s*\(\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)?\w*role`, "gi"),
        new RegExp(String.raw`roleKeys\s*\.\s*includes\s*\(\s*["'\`]${role}["'\`]`, "g"),
    ]) {
        for (const m of src.matchAll(re)) hits.push(m[0].replace(/\s+/g, " "));
    }
    return hits;
}

describe("W-44 / M2-6 — no authority decision names a role the product cannot assign", () => {
    it("only the assignable roles are ever inserted into role_definitions", () => {
        // The premise. If a migration started seeding `owner`, retiring its branches would become a
        // narrowing and this file's whole argument would collapse — so the premise is asserted, not
        // assumed.
        const seeded = new Set<string>();
        for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
            const sql = readFileSync(join(migrationsDir, file), "utf8");
            for (const stmt of sql.matchAll(/INSERT\s+INTO\s+(?:public\.)?role_definitions[\s\S]{0,3000}?;/gi)) {
                for (const key of stmt[0].matchAll(/'([a-z_]+)'/g)) {
                    if ([...ASSIGNABLE, ...NEVER_SEEDED].includes(key[1] as never)) seeded.add(key[1]!);
                }
            }
        }
        expect([...seeded].sort()).toEqual([...ASSIGNABLE].sort());
        for (const role of NEVER_SEEDED) expect(seeded.has(role)).toBe(false);
    });

    it("the database itself refuses a membership naming an unseeded role — W-16's FK", () => {
        // What turns "never seeded" into "unreachable". Asserted over the migration that adds it.
        const w16 = readdirSync(migrationsDir).find((f) => f.includes("w16_user_roles_role_foreign_key"));
        expect(w16, "W-16's FK migration is missing").toBeTruthy();
        const sql = readFileSync(join(migrationsDir, w16!), "utf8");
        expect(sql).toMatch(/FOREIGN\s+KEY\s*\(\s*org_id\s*,\s*role\s*\)/i);
        expect(sql).toMatch(/REFERENCES\s+public\.role_definitions/i);
    });

    it("no application authority decision names owner or manager", () => {
        const offenders: string[] = [];
        for (const rel of [...sourceFilesUnder("app"), ...sourceFilesUnder("lib")]) {
            const src = code(rel);
            for (const role of NEVER_SEEDED) {
                for (const hit of authorityRoleLiterals(src, role)) offenders.push(`${rel}: ${hit}`);
            }
        }
        expect(
            offenders,
            "these roles cannot be assigned, so a branch testing for them is unreachable — remove the "
                + "literal rather than leaving a dead authority path that reads as a live one",
        ).toEqual([]);
    });

    it("the scan finds the roles that ARE used, so it is not matching nothing", () => {
        // Non-vacuity on the walk. If the patterns stopped matching, the assertion above would pass
        // for the wrong reason.
        let found = 0;
        for (const rel of [...sourceFilesUnder("app"), ...sourceFilesUnder("lib")]) {
            found += authorityRoleLiterals(code(rel), "admin").length;
        }
        expect(found).toBeGreaterThan(3);
    });

    it("bites: an authority comparison against an unseeded role is convicted", () => {
        for (const fixture of [
            'if (ctx.role !== "owner" && ctx.role !== "admin") return forbidden();',
            'if (!["owner", "admin", "ops"].includes(ctx.role)) return forbidden();',
            'return access.roleKeys.includes("owner");',
        ]) {
            expect(authorityRoleLiterals(fixture, "owner").length, fixture).toBeGreaterThan(0);
        }
    });

    it("acquits: a non-role use of the same word is NOT convicted", () => {
        // `manager` is also a canvas zoom tier. Convicting that would be the string-coincidence
        // mistake, and it would push someone to rename a UI concept to satisfy a security lock.
        for (const fixture of [
            'const cap = focusTier === "manager" ? MAX_MANAGER : MAX_DEPARTMENT;',
            'zoomLevel === "department" && isManagerAmbientNodeId(id) ? "manager" : "department";',
            'const label = "owner";',
        ]) {
            expect(authorityRoleLiterals(fixture, "manager"), fixture).toEqual([]);
            expect(authorityRoleLiterals(fixture, "owner"), fixture).toEqual([]);
        }
    });

    it("the SQL half is left to AD-4, and is still there", () => {
        // Stated so "W-44 is done" is never read as including the RLS half. If these disappeared,
        // someone retired them without AD-4 and this test should say so.
        const sqlOwner = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .filter((f) => /has_org_role\([^)]*'owner'/i.test(readFileSync(join(migrationsDir, f), "utf8")));
        expect(
            sqlOwner.length,
            "no migration references 'owner' in an RLS predicate any more — if that was deliberate it "
                + "needed AD-4, which OD-7 does not resolve",
        ).toBeGreaterThan(0);
    });
});
