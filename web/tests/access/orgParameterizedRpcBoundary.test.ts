import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A MUTATING FUNCTION THAT TAKES ITS ORGANIZATION AS A PARAMETER IS NOT REACHABLE
 * BY A CLIENT.
 *
 * WHAT WAS MEASURED (deployed primary, 2026-09-30, census
 * `identity-access-rpc-and-tenancy-census.sql`): 14 mutating functions in `public`
 * were EXECUTE-granted to `authenticated`; 9 were SECURITY DEFINER; and NOT ONE
 * contained a caller-authority check of any kind — no `auth.uid()`, no `auth.role()`,
 * no `has_org_role`, no `effective_capability_keys`. Every one took the organization
 * it acts on as a parameter.
 *
 * SECURITY DEFINER is what makes that decisive rather than latent. The 259
 * `authenticated` table write grants recorded in `rls-authority-model-director-gate.md`
 * are survivable because RLS still says no on the write. A SECURITY DEFINER function
 * never consults RLS: it runs as its owner. For those 9, `p_org_id` was the only
 * tenancy in the path, and the caller supplied it.
 *
 * WHY THE EXISTING BOUNDARY MISSED THEM — AND WHY THAT MATTERS MORE THAN THE FIX.
 * `20260915160000` closed this exact class once, and `accessRpcExecuteBoundary.live.test.ts`
 * has been holding it shut ever since. Its scan matches `p_actor_user_id`, plus writers
 * of `user_roles` and `role_permission_grants`. Two near-misses walked through:
 *
 *   * `revoke_operational_authority_assignment(p_org_id, p_assignment_id, p_actor)`
 *     takes an actor — spelled `p_actor`.
 *   * `grant_operational_authority_assignment` and `upsert_operational_authority`
 *     write `operational_authority_assignments` — a SECOND authority table family.
 *
 * That migration's own header predicted this: *"The next actor-taking function will
 * ship exposed by default, and this is what notices."* It was right about the
 * mechanism and wrong about the coverage, because the scan enumerated the SPELLINGS
 * of the danger rather than its shape. `apply_held_funds_atomic` then shipped in
 * `20261102120000` with EXECUTE to PUBLIC, six weeks later, exactly as predicted.
 *
 * SEVERITY, SPLIT HONESTLY. `operational_authority_assignments` has no application
 * reader (measured: zero callers outside its own migration), so the authority-granting
 * subset is a latent escalation path — it must be closed before that model is switched
 * on, not because anything is exploiting it now. What is LIVE is
 * `execute_lead_status_mutation` and `execute_enrollment_status_mutation`: both
 * SECURITY DEFINER, both writing governed lifecycle state for any org the caller
 * names. PRs 1338-1341 established the canonical transition endpoint as the only
 * lifecycle writer and `validateStatusTransition` as the only gate — both
 * application-layer facts. These two functions bypass the route, the capability check
 * and the transition gate together.
 *
 * This lock is source-level on purpose. The behavioural assertion belongs to
 * `accessRpcExecuteBoundary.live.test.ts`, which reads `access_rpc_boundary_report()`
 * on a real database; it runs only where certification credentials exist. This file
 * holds what can be proved from the tree in every environment: that the widened
 * predicate is installed, and that no later migration re-opens the family.
 */

const MIGRATIONS = resolve(__dirname, "..", "..", "..", "supabase", "migrations");

/** The migration that widened the boundary to the org/actor-parameterized family. */
const BOUNDARY = "20261104120000";

const executable = (sql: string) =>
    sql
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n");

const migrations = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
        const body = readFileSync(join(MIGRATIONS, f), "utf8");
        return { file: f, version: f.split("_")[0] ?? "", body, code: executable(body) };
    });

const boundary = migrations.find((m) => m.version === BOUNDARY);

describe("org-parameterized mutating RPC execute boundary", () => {
    it("is not vacuous: the migration set parses and the boundary migration is present", () => {
        expect(migrations.length).toBeGreaterThan(400);
        expect(boundary, `migration ${BOUNDARY} is missing`).toBeTruthy();
    });

    it("the report's predicate covers the tenancy dimension, not just actor spellings", () => {
        const code = boundary!.code;
        // The whole point of the widening: an ORG parameter on a mutating function is
        // itself the danger, whatever the actor is called.
        expect(code, "the widened report does not test for a caller-supplied p_org_id").toMatch(/p_org_id/);
        expect(code, "the widened report does not test for any actor spelling beyond p_actor_user_id").toMatch(/p_actor/);
        expect(code, "the second authority table family is not covered").toMatch(/operational_authorit/);
        // Original scope must survive the rewrite — CREATE OR REPLACE means a
        // narrower body would silently retire the 2026-09 boundary.
        expect(code, "the original p_actor_user_id term was dropped").toMatch(/p_actor_user_id/);
        expect(code, "the original role_permission_grants term was dropped").toMatch(/role_permission_grants/);
        expect(code, "the original user_roles term was dropped").toMatch(/user_roles/);
    });

    it("closes the family to PUBLIC, anon and authenticated while keeping service_role", () => {
        const code = boundary!.code;
        for (const who of ["PUBLIC", "authenticated", "anon"]) {
            expect(
                new RegExp(`REVOKE\\s+EXECUTE[\\s\\S]{0,120}?FROM\\s+${who}`, "i").test(code),
                `the boundary never revokes EXECUTE from ${who}`,
            ).toBe(true);
        }
        expect(
            /GRANT\s+EXECUTE[\s\S]{0,120}?TO\s+service_role/i.test(code),
            "the boundary revokes client EXECUTE without granting service_role, which breaks the supported path "
                + "instead of protecting it",
        ).toBe(true);
    });

    it("refuses to apply if its predicate stops matching the family it was written for", () => {
        // A discovery loop that matches nothing revokes nothing and reports success.
        // The census measured 14; the migration must fail rather than pass vacuously.
        expect(
            /RAISE\s+EXCEPTION[\s\S]{0,200}?matched only/i.test(boundary!.code),
            "the boundary loop has no floor, so a predicate that stops matching would apply cleanly and close nothing",
        ).toBe(true);
        expect(boundary!.code).toMatch(/v_n\s*<\s*14/);
    });

    it("excludes trigger functions, which are not reachable through PostgREST", () => {
        // `handle_new_user` is the auth signup trigger. Revoking on it would be
        // meaningless at best; the run's instruction is explicit that Supabase
        // auth/session infrastructure must not be disturbed.
        expect(boundary!.code).toMatch(/prorettype\s*<>\s*'trigger'::regtype/);
    });

    it("no later migration grants a client EXECUTE on a mutating function", () => {
        const offenders: string[] = [];
        for (const m of migrations) {
            if (m.version <= BOUNDARY) continue;
            const grants = m.code.match(/GRANT\s+(?:ALL|EXECUTE)[\s\S]{0,300}?;/gi) ?? [];
            for (const g of grants) {
                if (!/ON\s+FUNCTION/i.test(g)) continue;
                if (/TO\s+(?:"?authenticated"?|"?anon"?|PUBLIC)/i.test(g)) {
                    offenders.push(`${m.file} -> ${g.replace(/\s+/g, " ").slice(0, 110)}`);
                }
            }
        }
        expect(
            offenders,
            "these migrations grant a client principal EXECUTE on a function after the boundary landed. Server mutation "
                + "runs as `service_role` after the route has resolved capability, tenancy and scope; a function reachable "
                + "by `authenticated` re-opens the path the boundary closed.",
        ).toEqual([]);
    });
});
