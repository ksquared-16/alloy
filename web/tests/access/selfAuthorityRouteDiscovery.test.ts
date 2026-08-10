/**
 * W-2 / RL-11 (tier B, discovered subject) — no route can mutate a principal's own
 * authority, and the subject is *found* rather than listed.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §5.
 *
 * Why this file exists alongside `selfAuthorityMutation.test.ts`:
 *
 * RL-11's exit criterion is "a principal cannot alter its own membership through ANY
 * product path". The existing lock proves the ban on three routes named in an array.
 * Those three are, today, the complete set — which is precisely the failure mode: a
 * fixed list re-checks files that are already correct and cannot notice a fourth
 * route arriving. RL-1, RL-3 and RL-4 each shipped green with a live escape for this
 * same reason, and the promotion reconciliation recorded RL-11 as the fourth
 * instance.
 *
 * Discovery here is by ROUTE SHAPE and IMPORT CLOSURE, not by table name in the route
 * file. A text census over route files is what missed `createOrgAndAssignAdmin` twice:
 * `users/[userId]/role/route.ts` mutates membership and contains the string
 * `user_roles` nowhere — it goes through a helper. Following the closure is the only
 * census that sees a helper-mediated writer.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..", "..");
const apiRoot = join(webRoot, "app", "api");

/* ------------------------------------------------------------------ module graph */

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (/\.tsx?$/.test(entry.name)) out.push(child);
        }
    };
    walk(join(webRoot, dir));
    return out;
}

const readCache = new Map<string, string>();
function read(abs: string): string {
    let src = readCache.get(abs);
    if (src === undefined) {
        src = readFileSync(abs, "utf8");
        readCache.set(abs, src);
    }
    return src;
}

/** Resolve a local import specifier to a file on disk. External packages resolve to null. */
function resolveImport(spec: string, fromAbs: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = join(webRoot, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
    else return null;

    for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
    ]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

const IMPORT_SPEC = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function localImports(abs: string): string[] {
    const out: string[] = [];
    for (const m of read(abs).matchAll(IMPORT_SPEC)) {
        const resolved = resolveImport(m[1], abs);
        if (resolved) out.push(resolved);
    }
    return out;
}

/* -------------------------------------------------------------- authority writes */

/**
 * The three tables that carry `(principal, org)` authority. `user_department_access`
 * is included because W-8 closed a self-insert on it; a future route could reopen
 * that path without touching `user_roles` at all.
 */
const AUTHORITY_TABLES = ["user_roles", "user_department_access", "membership_access_profiles"];

const TABLE_WRITE = new RegExp(
    `from\\(\\s*["'\`](?:${AUTHORITY_TABLES.join("|")})["'\`]\\s*\\)\\s*(?:\\.\\s*\\w+\\([^)]*\\)\\s*)*?\\.\\s*(insert|upsert|update|delete)\\b`
);

/** The sanctioned atomic writers. Reaching one of these is an authority write too. */
const AUTHORITY_RPCS = /create_membership_with_access_profile|replace_membership_with_access_profile/;

function writesAuthorityDirectly(abs: string): boolean {
    const src = read(abs);
    return TABLE_WRITE.test(src) || AUTHORITY_RPCS.test(src);
}

/** Does this module, or anything it transitively imports, write authority? */
const reachCache = new Map<string, boolean>();
function reachesAuthorityWrite(abs: string, stack: Set<string> = new Set()): boolean {
    const cached = reachCache.get(abs);
    if (cached !== undefined) return cached;
    if (stack.has(abs)) return false; // import cycle — no new information down this edge
    stack.add(abs);

    let result = writesAuthorityDirectly(abs);
    if (!result) {
        for (const dep of localImports(abs)) {
            if (reachesAuthorityWrite(dep, stack)) {
                result = true;
                break;
            }
        }
    }
    stack.delete(abs);
    reachCache.set(abs, result);
    return result;
}

/* ------------------------------------------------------------------------ routes */

function routeFiles(): string[] {
    return sourceFilesUnder(join("app", "api")).filter((abs) => /[/\\]route\.tsx?$/.test(abs));
}

const MUTATING_METHOD = /export\s+(?:async\s+)?function\s+(POST|PATCH|PUT|DELETE)\b/;

/** A route targets a principal if it takes a userId route param or reads one from the body. */
function targetsAPrincipal(abs: string): boolean {
    if (abs.includes("[userId]")) return true;
    return /\buser_?[iI]d\b/.test(read(abs));
}

function appliesSelfGuard(abs: string): boolean {
    return read(abs).includes("isSelfAuthorityMutation");
}

/**
 * Routes that reach an authority write and name a principal, but are NOT self-authority
 * mutations. Each needs a reason, and the reason has to survive the question "could the
 * caller raise its own authority in an org where it already has some?".
 *
 * This list is an exemption register, not the lock's subject: a new route that is not on
 * it fails the lock, which is the opposite of the enumerated-subject failure.
 */
const EXEMPT: { route: string; reason: string }[] = [
    {
        route: "app/api/admin/dev/create-org/route.ts",
        reason:
            "Bootstrap, not elevation. The org row is INSERTed by this same handler, so no membership " +
            "can pre-exist for the (user, org) pair and no authority is modified — it is created where " +
            "none existed. Additionally gated on DEV_TENANT_SPINUP_ENABLED and ctx.role === 'admin'. " +
            "Recorded here rather than left invisible: the promotion reconciliation flagged this path " +
            "as outside RL-11's subject, and an exemption with a reason is the closure of that finding.",
    },
    {
        route: "app/api/admin/users/route.ts",
        reason:
            "Invites a principal into the caller's org. The target is a new membership for an email " +
            "the caller supplies; self-invite is a duplicate membership, which the atomic helper " +
            "classifies as 'duplicate' rather than a widening. No existing grant is altered.",
    },
    {
        route: "app/api/admin/settings/users-roles/members/route.ts",
        reason: "Read-only roster projection for the Access screen; reaches no authority write.",
    },
    {
        route: "app/api/admin/lifecycle-catalog/delete/route.ts",
        reason:
            "Department teardown, and it only ever narrows. Discovered by this lock — it was in no " +
            "prior enumeration. It reaches `user_department_access` DELETE via " +
            "lifecycleActivationOwned.ts:111, keyed on (org_id, department_id) with no principal in " +
            "the predicate, so it cannot single out the caller. Checked for the inverse risk too: " +
            "removing grant rows does NOT widen under ABSENT_PROFILE_ENFORCEMENT='legacy-all', " +
            "because the scope MODE is read from the membership_access_profiles row " +
            "(resolveAdminAccessCore.ts:244-260) and only an absent PROFILE fails open. With the " +
            "profile intact and its rows gone, a 'restricted' principal resolves to [] — deny — not 'all'.",
    },
];

/* ------------------------------------------------------------------------- facts */

function authorityMutatingRoutes(): string[] {
    return routeFiles()
        .filter((abs) => MUTATING_METHOD.test(read(abs)))
        .filter((abs) => targetsAPrincipal(abs))
        .filter((abs) => reachesAuthorityWrite(abs))
        .map((abs) => relative(webRoot, abs).split("\\").join("/"));
}

describe("W-2 / RL-11 — the self-authority ban's subject is discovered", () => {
    /**
     * The load-bearing lock. A NEW route that can mutate a principal's authority fails
     * this on the commit that adds it, unless it is deliberately exempted with a reason.
     */
    it("every authority-mutating route applies the self guard or is a registered exemption", () => {
        const exemptRoutes = new Set(EXEMPT.map((e) => e.route));
        const unguarded = authorityMutatingRoutes()
            .filter((rel) => !exemptRoutes.has(rel))
            .filter((rel) => !appliesSelfGuard(join(webRoot, rel)));

        expect(
            unguarded,
            "apply isSelfAuthorityMutation (see @/lib/admin/selfAuthorityMutation), or add a " +
                "reasoned entry to EXEMPT — an unguarded authority writer re-opens G3/I-11"
        ).toEqual([]);
    });

    it("finds the three routes RL-11 already guards", () => {
        // If discovery silently stops matching, the lock above passes for the wrong
        // reason. Anchor it on the known-true subject.
        const found = authorityMutatingRoutes();
        expect(found).toContain("app/api/admin/users/[userId]/role/route.ts");
        expect(found).toContain("app/api/admin/users/[userId]/access-scope/route.ts");
        expect(found).toContain("app/api/admin/users/[userId]/remove/route.ts");
    });

    it("sees a helper-mediated writer that a table-name census misses", () => {
        // `role/route.ts` mutates membership and contains no authority table name. This
        // is the exact escape that defeated the route-file census twice.
        const roleRoute = join(webRoot, "app/api/admin/users/[userId]/role/route.ts");
        expect(TABLE_WRITE.test(read(roleRoute))).toBe(false);
        expect(reachesAuthorityWrite(roleRoute)).toBe(true);
    });

    it("the discovery scan is not vacuous", () => {
        const routes = routeFiles();
        expect(routes.length).toBeGreaterThan(300);
        // The closure must be selective: most routes are not authority writers.
        const mutating = authorityMutatingRoutes();
        expect(mutating.length).toBeGreaterThan(0);
        expect(mutating.length).toBeLessThan(routes.length / 4);
    });

    it("every exemption names a route that still exists", () => {
        // An exemption for a deleted route is a hole waiting for the path to come back.
        for (const { route } of EXEMPT) {
            expect(existsSync(join(webRoot, route)), `${route} is exempted but absent`).toBe(true);
        }
    });

    it("every exemption carries a reason", () => {
        for (const { route, reason } of EXEMPT) {
            expect(reason.trim().length, `${route} has no reason`).toBeGreaterThan(40);
        }
    });
});
