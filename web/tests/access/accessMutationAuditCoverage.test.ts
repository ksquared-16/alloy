/**
 * D2 — EVERY ACCESS MUTATION IS AUDITED, AND THE SCAN CANNOT GO GREEN BY LOSING THE CODE.
 *
 * "6 of 6 producers" is a number that stops meaning anything the moment a seventh route appears, or
 * the moment a write moves somewhere the scan no longer looks. Three earlier discovery scans in this
 * lane stopped finding routes for exactly the second reason — their writes moved behind RPCs — and
 * each one reported a clean pass while covering nothing.
 *
 * So this file DISCOVERS the access mutation paths by following the import closure of every non-GET
 * route handler, asserts a floor on how many it found, and then requires of each one:
 *
 *   - it reaches an audited transaction owner, and
 *   - it derives the actor from the authenticated context rather than from the request.
 *
 * And of each audited owner, from the migrations themselves:
 *
 *   - the event is written INSIDE the function that changes access, and
 *   - the function refuses a change that names no actor.
 *
 * A route that moved its write behind a new RPC still counts, because the RPC is discovered from the
 * route's own text. A route that bypassed the owners entirely fails, because the table write would
 * appear with no audited call beside it.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { isMutationCommandKey } from "./permissionCatalogDiscovery";

const webRoot = join(__dirname, "..", "..");
const repoRoot = join(webRoot, "..");
const apiRoot = join(webRoot, "app", "api");
const migrationsDir = join(repoRoot, "supabase", "migrations");

/** The six audited transaction owners. Each one is the ONLY way its mutation may happen. */
const AUDITED_OWNERS = [
    "replace_role_permission_grants",
    "save_role_definition_and_grants",
    "create_role_definition_audited",
    "replace_membership_with_access_profile",
    "remove_member_access_audited",
    "replace_member_access_scope_audited",
] as const;

/** Tables whose contents ARE someone's access. A write here outside an owner is an unaudited path. */
const ACCESS_TABLES = [
    "user_roles",
    "role_permission_grants",
    "role_definitions",
    "user_access_profiles",
    "user_site_access",
    "user_department_access",
];

/* ------------------------------------------------------------------ module graph */

function tsFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (/\.tsx?$/.test(entry.name)) out.push(child);
        }
    };
    walk(dir);
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

function resolveImport(spec: string, fromAbs: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = join(webRoot, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
    else return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

/**
 * Every source file a route can reach.
 *
 * Following the closure rather than reading the route file is the whole point: the routes moved their
 * writes behind helpers and then behind RPCs, and a text census over route files saw neither.
 */
function closureOf(entry: string): string[] {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
        const abs = stack.pop()!;
        if (seen.has(abs)) continue;
        seen.add(abs);
        const src = read(abs);
        for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
            const next = resolveImport(m[1]!, abs);
            if (next && !seen.has(next)) stack.push(next);
        }
    }
    return [...seen];
}

const routeFiles = tsFilesUnder(apiRoot).filter((f) => /route\.tsx?$/.test(f));
const MUTATING_HANDLER = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

type AccessRoute = { rel: string; owners: string[]; closure: string[] };

const accessRoutes: AccessRoute[] = [];
for (const file of routeFiles) {
    const src = read(file);
    if (!MUTATING_HANDLER.test(src)) continue;
    const closure = closureOf(file);
    const text = closure.map(read).join("\n");
    const owners = AUDITED_OWNERS.filter((o) => text.includes(o));
    if (owners.length) accessRoutes.push({ rel: relative(webRoot, file), owners, closure });
}

const migrationSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ file: f, sql: readFileSync(join(migrationsDir, f), "utf8") }));

/** The LAST definition of a function wins, because a later migration replaces an earlier one. */
function latestDefinitionOf(fn: string): string | null {
    let found: string | null = null;
    for (const { sql } of migrationSql) {
        const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\s*\\(([\\s\\S]*?)\\$fn\\$;`, "i");
        const m = sql.match(re);
        if (m) found = m[0];
    }
    return found;
}

describe("D2 — access mutation audit coverage", () => {
    it("finds the access mutation routes rather than trusting a list", () => {
        // NON-VACUITY. A scan that found nothing must fail, not pass quietly — this is the exact
        // failure three earlier discovery scans in this lane shipped green with.
        expect(accessRoutes.length, "the scan lost the access mutation routes").toBeGreaterThanOrEqual(6);
    });

    it("accounts for all six audited transaction owners", () => {
        const reached = new Set(accessRoutes.flatMap((r) => r.owners));
        for (const owner of AUDITED_OWNERS) {
            expect([...reached], `no route reaches ${owner}; a producer has no caller`).toContain(owner);
        }
        expect(reached.size).toBe(AUDITED_OWNERS.length);
    });

    it("derives the actor from the authenticated context on every audited route", () => {
        for (const route of accessRoutes) {
            const text = route.closure.map(read).join("\n");
            expect(text, `${route.rel} changes access without naming who did it`).toContain("accessMutationAudit");
        }
    });

    it("never accepts an actor, an origin or a correlation id from the request body", () => {
        /*
         * A route that read `body.operator_id` would let a caller sign someone else's name to its own
         * change — the single property the audit exists to guarantee. The mounted boundaries spec
         * proves the server ignores a forged field; this proves no route ever starts reading one.
         */
        const forged = /\bbody\s*(?:\.\s*|\[\s*["'])(operator_id|actor|actor_user_id|audit_origin|correlation_id)\b/;
        for (const route of accessRoutes) {
            for (const file of route.closure) {
                if (!file.includes(join("app", "api"))) continue;
                const src = read(file);
                expect(forged.test(src), `${relative(webRoot, file)} reads an audit field from the request`).toBe(false);
            }
        }
    });

    it("writes the event inside the function that changes access, for every owner", () => {
        for (const owner of AUDITED_OWNERS) {
            const def = latestDefinitionOf(owner);
            expect(def, `no migration defines public.${owner}`).toBeTruthy();
            /*
             * INSIDE the function body, which is what makes the audit atomic. A version that mutated
             * access and wrote the event beside it would pass every other check here and still lose
             * the event whenever the second statement failed.
             */
            expect(def!, `${owner} does not write mutation_events`).toMatch(/INSERT INTO public\.mutation_events/i);
            expect(def!, `${owner} would record an access change with no actor`).toContain("audit_actor_required");
        }
    });

    it("keeps exactly one signature per owner, so no caller meets PGRST203", () => {
        /*
         * `CREATE OR REPLACE` with an added DEFAULTed parameter creates a SECOND function rather than
         * replacing the first, and PostgREST then refuses every call it cannot disambiguate. That
         * happened here; `20260911220000` dropped the narrow forms. This is the structural half of the
         * pin — the live suite calls each one to prove the runtime half.
         */
        const dropped = migrationSql.map((m) => m.sql).join("\n");
        for (const owner of ["replace_role_permission_grants", "save_role_definition_and_grants", "replace_membership_with_access_profile"]) {
            expect(dropped, `the narrow ${owner} was never dropped`).toMatch(
                new RegExp(`DROP FUNCTION IF EXISTS public\\.${owner}\\(`, "i")
            );
        }
        /*
         * And nothing reintroduced a shim BESIDE an owner, which would be an unaudited path to the
         * same mutation — the reason the narrow forms were dropped rather than kept. Scoped to the
         * owners' own names: a blanket search for "legacy" across 400 migrations convicts unrelated
         * history and would have to be relaxed, which is how a lock stops meaning anything.
         */
        for (const owner of AUDITED_OWNERS) {
            expect(dropped, `a shim beside ${owner} is an unaudited path to the same mutation`).not.toMatch(
                new RegExp(`FUNCTION\\s+public\\.${owner}_(compat|legacy|unaudited|v\\d)\\b`, "i")
            );
        }
    });

    it("does not let an access table be written outside an audited owner", () => {
        /*
         * The routes may still READ these tables and may still write them through the owners. What
         * must not exist is a route handler that writes one directly — that is an access change with
         * no event, which is the whole defect class D2 closes.
         */
        const directWrite = new RegExp(
            `from\\(\\s*["'](${ACCESS_TABLES.join("|")})["']\\s*\\)[\\s\\S]{0,120}?\\.(insert|update|upsert|delete)\\b`
        );
        const offenders: string[] = [];
        for (const file of routeFiles) {
            const src = read(file);
            if (!MUTATING_HANDLER.test(src)) continue;
            if (directWrite.test(src)) offenders.push(relative(webRoot, file));
        }
        expect(offenders, "these routes change access without an audited transaction owner").toEqual([]);
    });

    it("keeps audit command names out of the capability catalog", () => {
        /*
         * PHASE 23. `access.role.created` is a `mutation_events.command_key` — what an operator DID.
         * It is key-shaped, and the enforcement scanner convicted the presenter of enforcing seven
         * capabilities the platform does not have. The distinction is by prefix, and it must not be
         * so broad that a real capability could hide behind it.
         */
        for (const command of [
            "access.role.created",
            "access.role.updated",
            "access.role.grants_changed",
            "access.user.roles_changed",
            "access.user.removed",
            "access.user.scope_changed",
        ]) {
            expect(isMutationCommandKey(command), `${command} is a command, not a capability`).toBe(true);
        }

        // Real capabilities must NOT be swallowed by the exclusion.
        for (const capability of ["settings.users_roles", "fin.read", "portal.access", "crm.customers.read"]) {
            expect(isMutationCommandKey(capability), `${capability} is a real capability and must stay catalogued`).toBe(false);
        }
    });
});
