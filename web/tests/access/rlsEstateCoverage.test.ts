import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * EVERY ORG-OWNED TABLE IN `public` CARRIES RLS — AS THE TREE GROWS.
 *
 * MEASURED on the deployed primary 2026-09-30: 322 public base tables, 320 with RLS
 * enabled. The two exceptions — `payment_provider_disputes` and
 * `commercial_policy_exceptions` — both carried `org_id` and both granted
 * `authenticated` SELECT, so ANY authenticated principal read EVERY organization's
 * rows. `20261104130000` repairs both.
 *
 * WHY THIS LOCK AND NOT THE MIGRATION'S OWN GUARD. The migration asserts only the two
 * tables it repaired, because `migrationSelfTestScope.test.ts` records what happens
 * otherwise: an estate-wide claim inside a narrow migration turns another lane's new
 * table into a refusal to apply THIS one. The invariant still has to be held
 * somewhere as migrations accumulate, and this is that place.
 *
 * WHY IT IS NOT MERELY TIDINESS. In PostgreSQL a newly created table has no RLS, and
 * Supabase's default privileges grant `authenticated` SELECT. So a new table is
 * world-readable across tenants THE MOMENT IT EXISTS unless the same migration says
 * otherwise. That is how both exceptions arose — neither was a decision. The rule is
 * therefore about the default, not about discipline: the safe state requires an
 * explicit statement, so the explicit statement is required.
 */

const MIGRATIONS = resolve(__dirname, "..", "..", "..", "supabase", "migrations");

type Mig = { file: string; version: string; body: string; code: string };

/** Comments explain; they do not execute. */
const executable = (sql: string) =>
    sql
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n");

const migrations: Mig[] = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
        const body = readFileSync(join(MIGRATIONS, f), "utf8");
        return { file: f, version: f.split("_")[0] ?? "", body, code: executable(body) };
    });

/** The migration that repaired the estate. Anything before it describes the old world. */
const REPAIR = "20261104130000";

/** Tables created in `public` by a migration, from CREATE TABLE statements. */
function createdTables(code: string): string[] {
    const out: string[] = [];
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) if (m[1]) out.push(m[1]);
    return [...new Set(out)];
}

/** Tables the same migration enables RLS on. */
function rlsEnabled(code: string): Set<string> {
    const out = new Set<string>();
    const re = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?\s+enable\s+row\s+level\s+security/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) if (m[1]) out.add(m[1]);
    return out;
}

/**
 * The table each CREATE POLICY statement actually targets.
 *
 * Statement-scoped: each `CREATE POLICY` is taken up to its terminating `;`, and the
 * FIRST `ON public.<table>` inside that statement is its subject. A file-wide regex
 * cannot do this — it will happily pair one statement's verb with another statement's
 * table, which is exactly how the first version of this guard survived a planted
 * regression.
 */
function createPolicyTargets(code: string): string[] {
    const out: string[] = [];
    const re = /create\s+policy\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        const end = code.indexOf(";", m.index);
        const stmt = code.slice(m.index, end === -1 ? code.length : end);
        const on = stmt.match(/\bon\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/i);
        if (on?.[1]) out.push(on[1]);
    }
    return [...new Set(out)];
}

/**
 * Tables that legitimately hold no `org_id` and are not tenant data. A table with no
 * organization column cannot leak across organizations, so the rule does not apply —
 * but the exemption is by MEASURED ABSENCE of org_id in the creating migration, not
 * by name, so it cannot be claimed for a table that does carry one.
 */
function declaresOrgId(code: string, table: string): boolean {
    const re = new RegExp(
        `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?["']?${table}["']?\\s*\\(([\\s\\S]*?)\\n\\s*\\)\\s*;`,
        "i",
    );
    const m = code.match(re);
    return m ? /\borg_id\b/i.test(m[1] ?? "") : false;
}

describe("RLS estate coverage", () => {
    it("is not vacuous: the sweep parses migrations and finds created tables", () => {
        expect(migrations.length).toBeGreaterThan(400);
        const total = migrations.flatMap((m) => createdTables(m.code));
        expect(total.length, "no CREATE TABLE statement was parsed at all").toBeGreaterThan(100);
    });

    it("the repair migration exists and enables RLS on both measured exceptions", () => {
        const repair = migrations.find((m) => m.version === REPAIR);
        expect(repair, `migration ${REPAIR} is missing`).toBeTruthy();
        const enabled = rlsEnabled(repair!.code);
        expect([...enabled].sort()).toEqual(["commercial_policy_exceptions", "payment_provider_disputes"]);
    });

    it("the repair leaves each table readable by the service-role path", () => {
        // RLS on with no policy denies every principal, including the only real
        // readers. Closing a leak by breaking the feature is not closing it.
        //
        // This is parsed as STATEMENTS rather than pattern-matched across the file.
        // The first draft used `create policy [\s\S]{0,200}? on public.<t>`, and a
        // planted regression that replaced the CREATE POLICY line still passed,
        // because the table name survived two lines below on its own `ON` clause and
        // the lazy gap simply stepped over the damage. A guard that can be satisfied
        // by the wreckage of the thing it checks is worse than no guard.
        const repair = migrations.find((m) => m.version === REPAIR)!;
        const created = createPolicyTargets(repair.code);
        for (const t of ["payment_provider_disputes", "commercial_policy_exceptions"]) {
            expect(
                created,
                `${t} gets RLS but no CREATE POLICY names it, so service_role cannot read it`,
            ).toContain(t);
        }
    });

    it("every migration after the repair that creates an org-owned table enables RLS on it", () => {
        const offenders: string[] = [];
        for (const m of migrations) {
            if (m.version <= REPAIR) continue; // the old world is described, not re-litigated
            const enabled = rlsEnabled(m.code);
            for (const t of createdTables(m.code)) {
                if (!declaresOrgId(m.code, t)) continue; // no tenant column, no cross-tenant leak
                if (!enabled.has(t)) offenders.push(`${m.file} -> ${t}`);
            }
        }
        expect(
            offenders,
            "these migrations create a table with an `org_id` column and never enable row level security on it. "
                + "A new table has no RLS and Supabase's default privileges grant `authenticated` SELECT, so it is "
                + "readable across every organization from the moment it exists. Add "
                + "`ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;` and a policy in the same migration.",
        ).toEqual([]);
    });
});
