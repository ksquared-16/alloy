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
 * A fixed list re-checks files that are already correct and cannot notice a fourth
 * route arriving. RL-1, RL-3 and RL-4 each shipped green with a live escape for this
 * same reason, and the promotion reconciliation recorded RL-11 as the fourth
 * instance.
 *
 * **Those three stopped being the complete set, and discovery did not say so.** W-17
 * shipped `users/[userId]/roles` and `users/[userId]/roles/[roleKey]`, both of which
 * mutate membership authority and both of which apply the self guard. Neither entered
 * the subject, because the RPCs they call were not in `AUTHORITY_RPCS` — so discovery
 * was, for those two routes, exactly the fixed list it exists to replace. Corrected
 * 2026-09-11; see `AUTHORITY_RPCS` and `AUTHORITY_TABLES` for what that cost and what
 * now fails when it recurs.
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

/**
 * Comments removed, so a table or RPC *named in prose* cannot be mistaken for a write.
 *
 * Added 2026-09-06 (ninth issuance) after this lock went red on a comment. A doc-comment
 * edit to `lib/admin/resolveAdminAccessCore.ts` — the resolver nearly every admin route
 * imports — mentioned `create_membership_with_access_profile` while explaining that the
 * RPC is *convention a direct INSERT bypasses*. No code changed. Because the predicates
 * below read raw source, that one word made the resolver an authority writer and dragged
 * **180 of 603** routes into the subject through import closure.
 *
 * This is the §10.2 failure mode — mention vs. call — and it is the same defect RL-1 fixed
 * on 2026-08-06 in `analyticsRouteGates.test.ts`. The idiom is deliberately copied from
 * there, including the rule that `//` is stripped only when not preceded by `:`, so a
 * `http://` inside a string literal does not truncate the line and hide a real write.
 */
function codeOnly(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const codeCache = new Map<string, string>();
function code(abs: string): string {
    let src = codeCache.get(abs);
    if (src === undefined) {
        src = codeOnly(read(abs));
        codeCache.set(abs, src);
    }
    return src;
}

const IMPORT_SPEC = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function localImports(abs: string): string[] {
    const out: string[] = [];
    for (const m of code(abs).matchAll(IMPORT_SPEC)) {
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
 *
 * **The third entry was a migration filename, not a table — corrected 2026-09-11 (Wave 1's
 * tenth issuance).** It read `membership_access_profiles`, which appears **nowhere** in the
 * SQL corpus: `grep -rl membership_access_profiles supabase` returns zero files. The name is
 * a fragment of `20260807140000_backfill_membership_access_profiles.sql` (M1, the profile
 * backfill), quoted by `resolveAdminAccessCore.ts:79` as a *filename* and transcribed here as
 * a *table*. The live table is `user_access_profiles`.
 *
 * So the table half of this predicate has only ever policed **two** of the three tables it
 * claims, and a route doing `.from("user_access_profiles").insert(…)` — a direct write to the
 * row that decides a membership's scope mode — was invisible to discovery. **Latent, not
 * live:** no module under `web/lib` or `web/app` writes that table today (only tests and seed
 * scripts, which no route imports), so the corrected name adds no route to the subject. It is
 * the same "one import away from live" shape RL-1 recorded for the `getAdminAccessContext`
 * alias, and the same class as the eighth issuance's *"a typo in `SUFFICIENT_GATES` reads
 * exactly like a gate no route calls"* — which is why the lock below now checks that every
 * name here is a table the schema has heard of.
 */
const AUTHORITY_TABLES = ["user_roles", "user_department_access", "user_access_profiles"];

const TABLE_WRITE = new RegExp(
    `from\\(\\s*["'\`](?:${AUTHORITY_TABLES.join("|")})["'\`]\\s*\\)\\s*(?:\\.\\s*\\w+\\([^)]*\\)\\s*)*?\\.\\s*(insert|upsert|update|delete)\\b`
);

/**
 * The sanctioned atomic writers. Reaching one of these is an authority write too.
 *
 * D2 added two: removal and access-scope moved behind transaction owners so state and audit commit
 * together. A discovery that knew only the table writes stopped seeing those routes entirely — the
 * non-vacuity assertion caught it, which is the whole reason this file asserts its own subject
 * before asserting anything about it.
 *
 * `create_role_definition_audited` is deliberately NOT here. This constant's subject is writes that
 * carry `(principal, org)` authority, and creating an empty role definition grants nobody anything —
 * there is no self-escalation in it. Adding it would widen the predicate past the thing the file
 * says it is about, and the self-guard assertion would then demand a guard for a mutation with no
 * subject to guard. `replace_role_permission_grants` and `save_role_definition_and_grants` are out
 * for the same reason at a different grain: they change what a *role* grants, not who holds it, so
 * a principal widening its own role's grants is self-elevation this file does not cover. W-2's own
 * record names that as W-18's ceiling; it is written here so the omission is a decision on record
 * rather than a gap in a regex. Half of it has since been closed *below* this layer:
 * `20260911260000_d2_no_self_inflicted_access_lockout.sql` refuses, inside
 * `replace_role_permission_grants` itself, an edit that strips the actor's own last source of
 * `settings.users_roles`. That is the narrowing direction only — widening your own role's grants is
 * still open, and still W-18's.
 *
 * **W-17's two audited role RPCs were missing — added 2026-09-11 (Wave 1's tenth issuance).**
 * `assign_member_role_audited` INSERTs `public.user_roles` and `remove_member_role_audited` DELETEs
 * from it (`20260912010000_w17_additive_role_assignment.sql:87,172`), so both are
 * `(principal, org)` authority writes by this constant's own definition. Two routes reach them —
 * `users/[userId]/roles/route.ts` (POST) and `users/[userId]/roles/[roleKey]/route.ts` (DELETE) —
 * and until this line both were **outside the discovered subject entirely**.
 *
 * **They were hidden twice over, and the second way is the one worth recording.** The names are
 * never written at a `.rpc("…")` call site: `memberRoleAssignmentWrite.ts:37` passes them as a
 * *variable* typed `"assign_member_role_audited" | "remove_member_role_audited"`. So a derivation
 * that scanned the product for RPC string literals — the obvious durable repair, and the shape the
 * eighth issuance used to derive `ACCESS_PRIMITIVE_MODULES` — would have missed them too. This is
 * the **ninth** instance of this workstream's recurring escape class and the first where the
 * escape is an *indirected name* rather than an unlisted entry.
 *
 * **The invariant itself held.** Both routes call `isSelfAuthorityMutation` before any write
 * (`roles/route.ts:28`, `roles/[roleKey]/route.ts:34`), so no principal could alter its own
 * membership through them. That was W-17's author's diligence, not this lock's doing — which is
 * exactly the property the discovered subject exists to stop relying on.
 */
const AUTHORITY_RPCS = /create_membership_with_access_profile|replace_membership_with_access_profile|remove_member_access_audited|replace_member_access_scope_audited|assign_member_role_audited|remove_member_role_audited/;

function writesAuthorityDirectly(abs: string): boolean {
    const src = code(abs);
    return TABLE_WRITE.test(src) || AUTHORITY_RPCS.test(src);
}

/**
 * Every `.sql` file in the schema corpus.
 *
 * Read only by the table-existence lock below. `TABLE_WRITE` is built by interpolation, so a name
 * in `AUTHORITY_TABLES` that no table ever had produces a regex that compiles, runs, matches
 * nothing, and reports a clean pass forever — indistinguishable from a table nobody writes. The
 * schema is the only place that can tell those two apart.
 */
function sqlCorpusSources(): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (entry.name.endsWith(".sql")) out.push(read(child));
        }
    };
    walk(join(webRoot, "..", "supabase"));
    return out;
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
/**
 * A route targets a principal if it takes a userId route param or reads one from the body.
 *
 * The leading `\b` was removed 2026-09-06 (ninth issuance), and that is not a cosmetic
 * widening. `admin/dev/create-org/route.ts` reads its target from the body field
 * `admin_user_id` (`:41`), and `\buser_?[iI]d\b` **cannot** match it: `_` is a word
 * character, so there is no boundary before `user`. That route was in the subject only
 * because its doc comment (`:18`) says *"upsert on user_id + org_id + role"* — i.e. the
 * lock was holding a real membership writer through a sentence in prose, and stripping
 * comments alone would have dropped it silently.
 *
 * Over-matching is safe here: this predicate is conjunctive with `reachesAuthorityWrite`,
 * so a route that names a principal but writes no authority is still out of the subject.
 */
function targetsAPrincipal(abs: string): boolean {
    if (abs.includes("[userId]")) return true;
    return /user_?[iI]d\b/.test(code(abs));
}

/**
 * The guard must be *called*, not merely named.
 *
 * This is the permissive half of the same comment blindness, and it is the dangerous half:
 * the form above credited any file containing the string, so a route carrying only
 * `// TODO: isSelfAuthorityMutation` would have been recorded as guarded and dropped out of
 * `unguarded` silently. Every real call site uses the call form, so requiring it costs nothing
 * today and closes the escape.
 *
 * **Five call sites as of 2026-09-11, not three** — `role:35`, `remove:48`, `access-scope:83`,
 * and W-17's `roles:28` and `roles/[roleKey]:34`. The line citations are re-read each issuance
 * rather than carried, because a stale line number in a lock's own commentary is how a reader
 * concludes the lock has been re-checked when it has not.
 */
function appliesSelfGuard(abs: string): boolean {
    return code(abs).includes("isSelfAuthorityMutation(");
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
        .filter((abs) => MUTATING_METHOD.test(code(abs)))
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

    it("finds the five routes RL-11 already guards", () => {
        // If discovery silently stops matching, the lock above passes for the wrong
        // reason. Anchor it on the known-true subject.
        const found = authorityMutatingRoutes();
        expect(found).toContain("app/api/admin/users/[userId]/role/route.ts");
        expect(found).toContain("app/api/admin/users/[userId]/access-scope/route.ts");
        expect(found).toContain("app/api/admin/users/[userId]/remove/route.ts");
        // W-17's additive pair, anchored 2026-09-11. Both were guarded and neither was
        // discovered, because `AUTHORITY_RPCS` did not name the RPCs they call.
        expect(found).toContain("app/api/admin/users/[userId]/roles/route.ts");
        expect(found).toContain("app/api/admin/users/[userId]/roles/[roleKey]/route.ts");
    });

    it("sees a helper-mediated writer that a table-name census misses", () => {
        // `role/route.ts` mutates membership and contains no authority table name. This
        // is the exact escape that defeated the route-file census twice.
        const roleRoute = join(webRoot, "app/api/admin/users/[userId]/role/route.ts");
        expect(TABLE_WRITE.test(code(roleRoute))).toBe(false);
        expect(reachesAuthorityWrite(roleRoute)).toBe(true);
    });

    it("does not credit an authority write that appears only in a comment", () => {
        // The regression that produced this assertion, stated as a fact about the source rather
        // than a claim in prose. This is the shape of the edit that reddened the lock: a doc
        // comment naming the atomic RPC while explaining that a direct INSERT bypasses it.
        const commentOnly = `
            /**
             * \`create_membership_with_access_profile\` (20260807090001) is convention that a
             * direct INSERT bypasses, so nothing in the tree enforces the invariant.
             */
            // We used to do supabase.from("user_roles").insert(row) here.
            export const ABSENT_PROFILE_ENFORCEMENT = "legacy-all";
        `;
        expect(AUTHORITY_RPCS.test(codeOnly(commentOnly))).toBe(false);
        expect(TABLE_WRITE.test(codeOnly(commentOnly))).toBe(false);
        // …and the pre-repair form — the predicates over raw source — credited both.
        expect(AUTHORITY_RPCS.test(commentOnly)).toBe(true);
        expect(TABLE_WRITE.test(commentOnly)).toBe(true);
    });

    it("does not credit a self guard that appears only in a comment", () => {
        // The permissive half, and the one that could have hidden a real unguarded writer.
        const commentOnly = codeOnly(`// TODO: isSelfAuthorityMutation before shipping`);
        expect(commentOnly.includes("isSelfAuthorityMutation(")).toBe(false);
        expect(codeOnly(`if (isSelfAuthorityMutation({ callerUserId, targetUserId })) {`))
            .toContain("isSelfAuthorityMutation(");
    });

    it("keeps a URL in a string literal out of the comment stripper", () => {
        // `//` inside `http://` must not truncate the line and hide a real authority write.
        const withUrl = `const r = new NextRequest("http://x/y"); await sb.from("user_roles").insert(row);`;
        expect(TABLE_WRITE.test(codeOnly(withUrl))).toBe(true);
    });

    it("the discovery scan is not vacuous, and its subject is exact", () => {
        const routes = routeFiles();
        expect(routes.length).toBeGreaterThan(300);

        // **Executed, not derived.** The old bound here was `< routes.length / 4` — 150 against a
        // true subject of 6, i.e. 25× slack. That is what let the 2026-09-06 comment regression
        // reach **180 of 603** before anything complained, and a narrower false positive would
        // have passed in silence. The subject is asserted exactly instead: three guarded routes
        // plus the three registered exemptions, and nothing else.
        //
        // A new authority writer therefore fails HERE with a name as well as failing the lock
        // above with a remedy. Adding one is a decision, not a retune.
        //
        // **Six → eight, 2026-09-11 (tenth issuance).** W-17's `roles` pair joined the subject
        // when `AUTHORITY_RPCS` learned the two audited role RPCs they call. That is the whole
        // point of asserting the subject exactly: the pair had existed, guarded, for the entire
        // eighth issuance, and a bound with slack in it would have absorbed them in silence.
        //
        // Sorted explicitly, also 2026-09-11. The order was previously whatever `readdirSync`
        // returned, which happens to be lexical on this filesystem — a dependency nobody chose
        // and which growth in the subject makes newly load-bearing. Sorting asserts the same set
        // exactly; it removes only the filesystem's vote on how it is spelled.
        expect([...authorityMutatingRoutes()].sort()).toEqual([
            "app/api/admin/dev/create-org/route.ts",
            "app/api/admin/lifecycle-catalog/delete/route.ts",
            "app/api/admin/users/[userId]/access-scope/route.ts",
            "app/api/admin/users/[userId]/remove/route.ts",
            "app/api/admin/users/[userId]/role/route.ts",
            "app/api/admin/users/[userId]/roles/[roleKey]/route.ts",
            "app/api/admin/users/[userId]/roles/route.ts",
            "app/api/admin/users/route.ts",
        ]);
    });

    it("polices only tables the schema has heard of", () => {
        // The lock that would have caught `membership_access_profiles` on the day it was written,
        // added 2026-09-11 (tenth issuance) with the correction it describes. A table name is the
        // one part of this file that cannot be checked by reading TypeScript: the product is
        // *supposed* to contain no writer for a table nobody writes, so silence proves nothing.
        // Asking the schema instead makes a fictional name fail by name.
        const sources = sqlCorpusSources();

        // Non-vacuity first — a mis-rooted or empty walk would clear every name, fictional ones
        // included, which is precisely the failure this assertion exists to make impossible.
        expect(sources.length).toBeGreaterThan(300);

        const unknown = AUTHORITY_TABLES.filter((table) => !sources.some((sql) => sql.includes(table)));
        expect(
            unknown,
            "an authority table that appears nowhere under supabase/ is a name this predicate has " +
                "never matched and never could — `membership_access_profiles` was a migration " +
                "filename read as a table, and it policed nothing from 2026-08-10 to 2026-09-11"
        ).toEqual([]);
    });

    it("every exemption is still in the discovered subject", () => {
        // The stale-entry half of the exemption-register discipline, from W-4's ratchet and
        // applied to `ACCESS_PRIMITIVE_MODULES` by the eighth issuance. An exemption for a route
        // the scan no longer discovers is dead text that reads like live review, and it hides
        // the fact that nobody has re-checked it. This found one on arrival:
        // `settings/users-roles/members/route.ts`, exempted as a read-only roster projection —
        // true, and therefore never in the subject, so the entry excused nothing.
        const subject = new Set(authorityMutatingRoutes());
        const stale = EXEMPT.map((e) => e.route).filter((route) => !subject.has(route));
        expect(
            stale,
            "remove the entry — an exemption whose route is not discovered excuses nothing"
        ).toEqual([]);
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
