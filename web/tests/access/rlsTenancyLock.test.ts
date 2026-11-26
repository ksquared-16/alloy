/**
 * RL-23 — RLS TENANCY CONTAINMENT.
 *
 * Model A (RLS Authority Model V1): route capabilities own business authorization; RLS owns
 * tenant-scoped reads and the containment of unsupported direct writes; `service_role` performs
 * server mutation and bypasses RLS entirely.
 *
 * This lock holds ONE invariant, and deliberately only one: **a policy that grants write access on
 * an organization-owned table must name the organization.** It does NOT require capability-aware
 * RLS, and asserts the opposite — that no business capability leaks into a policy.
 *
 * WHY A REPO LOCK AND NOT THE MIGRATION'S OWN SELF-TEST. `20260916040000` carries a `DO` block that
 * aborts if the defect survives, but a migration guard fires once, against the tree as it was that
 * day. Only a repo lock keeps the invariant true as migrations accumulate.
 *
 * WHAT THE DEFECT WAS. 76 policies across 51 tables read
 *   `EXISTS (SELECT 1 FROM app_users au WHERE au.id = auth.uid() AND au.role = ANY(...))`
 * with no organization predicate, and three more used `user_profiles` the same way. Both are dead
 * legacy identity tables — empty on the deployed database — so the policies granted nothing and the
 * cross-tenant reading was LATENT rather than live. They were removed rather than given tenancy,
 * because `has_org_role` resolves `user_roles` (13 admin-or-ops principals) and "adding tenancy"
 * would have converted deny-everyone into permit-same-org-admin: a widening dressed as a fix.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");
/** The repair. Migrations at or before this version describe the world before it was fixed. */
const REPAIR = "20260916040000";

type Mig = { file: string; version: string; body: string };

const migrations: Mig[] = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({
        file: f,
        version: f.split("_")[0] ?? "",
        body: fs.readFileSync(path.join(MIGRATIONS, f), "utf8"),
    }));

/** Comments explain; they do not execute. */
const executable = (sql: string) =>
    sql
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n");

/** Statements that CREATE a policy, one per match, body included. */
function createPolicyStatements(sql: string): string[] {
    const out: string[] = [];
    const re = /create\s+policy\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
        const end = sql.indexOf(";", m.index);
        out.push(sql.slice(m.index, end === -1 ? sql.length : end));
    }
    return out;
}

const WRITE = /\bfor\s+(all|insert|update|delete)\b/i;
const DEAD_IDENTITY = /\b(app_users|user_profiles)\b/i;
const NAMES_ORG = /org_id|has_org_role|current_org_id/i;
/** A business capability has no business being in a policy. */
const CAPABILITY = /\b(fin|work|tours|crm|reports|business_process|ai|forms|processing|communications|layouts|fields|scheduling|option_sets|sections|settings)\.[a-z_.]+/;

const after = migrations.filter((m) => m.version > REPAIR);

describe("RL-23 — an org-owned write policy must name the org", () => {
    it("non-vacuity: the migration corpus is found and the repair is in it", () => {
        expect(migrations.length).toBeGreaterThan(100);
        expect(migrations.some((m) => m.version === REPAIR)).toBe(true);
    });

    it("the repair migration carries its own abort guard", () => {
        const repair = migrations.find((m) => m.version === REPAIR)!;
        expect(repair.body).toContain("RLS TENANCY ABORT");
        expect(repair.body).toMatch(/RAISE\s+EXCEPTION/i);
    });

    /**
     * The forward-looking assertions. Migrations written BEFORE the repair legitimately contain the
     * old shape — that is what the repair removed — so scanning them would pin history rather than
     * the invariant. Everything after it must stay clean.
     */
    it("no migration after the repair creates a write policy keyed on a dead identity table", () => {
        const offenders: string[] = [];
        for (const m of after) {
            for (const stmt of createPolicyStatements(executable(m.body))) {
                const predicateSource = /from\s+(?:public\.)?(app_users|user_profiles)\b/i;
                if (WRITE.test(stmt) && predicateSource.test(stmt) && !NAMES_ORG.test(stmt)) {
                    offenders.push(`${m.file}: ${stmt.slice(0, 120)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("no migration after the repair creates a write policy that compares a column to itself", () => {
        const offenders: string[] = [];
        const TAUTOLOGY = /\(?\s*([a-z_]+)\.([a-z_]+)\s*=\s*\1\.\2\s*\)?/i;
        for (const m of after) {
            for (const stmt of createPolicyStatements(executable(m.body))) {
                if (TAUTOLOGY.test(stmt)) offenders.push(`${m.file}: ${stmt.slice(0, 120)}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * MODEL A, STATED AS A PROHIBITION. Business authorization belongs to route capabilities. A
     * capability key appearing in a policy means the two layers have started to disagree about who
     * owns the question — which is the thing the architecture gate decided against.
     */
    it("no migration after the repair puts a business capability into a policy", () => {
        const offenders: string[] = [];
        for (const m of after) {
            for (const stmt of createPolicyStatements(executable(m.body))) {
                const hit = CAPABILITY.exec(stmt);
                if (hit) offenders.push(`${m.file}: ${hit[0]}`);
            }
        }
        expect(offenders, "RLS must not authorize business functions; routes do that").toEqual([]);
    });

    it("no migration after the repair disables RLS on a table it also grants writes on", () => {
        const offenders: string[] = [];
        for (const m of after) {
            const body = executable(m.body);
            const disabled = [...body.matchAll(/alter\s+table\s+(?:public\.)?([a-z_]+)\s+disable\s+row\s+level\s+security/gi)]
                .map((x) => x[1]);
            for (const t of disabled) {
                const grants = new RegExp(`grant[^;]*\\b(insert|update|delete)\\b[^;]*on[^;]*\\b${t}\\b[^;]*to[^;]*authenticated`, "i");
                if (grants.test(body)) offenders.push(`${m.file}: ${t}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * The repair itself must remain a REMOVAL, not a rewrite that quietly re-grants. If someone
     * later edits it to "restore" the policies with has_org_role, that converts deny-everyone into
     * permit-same-org-admin — the widening this slice exists to avoid.
     */
    it("the repair removes the dead policies and does not recreate them under tenancy", () => {
        const repair = executable(migrations.find((m) => m.version === REPAIR)!.body);
        expect(repair).toMatch(/DROP POLICY IF EXISTS/);
        /*
         * The prohibition is on the dead table as a PREDICATE SOURCE — `EXISTS (SELECT ... FROM
         * app_users ...)` — not on the table as a policy SUBJECT. `app_users_read_self` is a SELECT
         * policy ON app_users whose predicate is `id = auth.uid()`; that clause is satisfiable and
         * was deliberately preserved when its dead admin half was dropped. Conflating the two would
         * forbid the correct repair.
         */
        const PREDICATE_SOURCE = /from\s+(?:public\.)?(app_users|user_profiles)\b/i;
        for (const stmt of createPolicyStatements(repair)) {
            if (!WRITE.test(stmt)) continue;
            expect(PREDICATE_SOURCE.test(stmt), `repair must not recreate a dead-identity write grant: ${stmt.slice(0, 90)}`).toBe(false);
        }
    });
});
