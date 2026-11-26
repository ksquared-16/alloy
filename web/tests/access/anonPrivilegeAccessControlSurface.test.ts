/**
 * W-60 / `S-13` (`RL-55`) — no migration hands `anon` a privilege on an access-control object.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §47, W-60.
 *
 * **The finding is that the PATTERN is live, not that an instance is open.** Forward protection is
 * `ALTER DEFAULT PRIVILEGES`, which governs objects created *without* an explicit grant — it *"does
 * not prevent a future migration from executing an explicit `GRANT … TO anon`, which is precisely
 * what Phase 0 did. The pattern is live; only this instance is closed"* (`01…§50`). The plan prices
 * the static form as **free**, and this is it.
 *
 * **Audit result that opens W-60, recorded here because it is the thing the plan asks for first.**
 * §47 says W-60 *"opens by auditing the base-table grant, not by dropping the views"*, because
 * dropping the object carrying a contradiction is not the same as resolving it. Audited from the
 * repository this pass:
 *
 *   - the 2026-03-29 baseline executes `GRANT ALL ON TABLE … TO "anon"` on SIX access-control
 *     objects — `permission_definitions`, `permissions`, `permission_keys`, `role_definitions`,
 *     `role_permission_grants`, `user_roles`;
 *   - Phase 0 then adds `GRANT SELECT ON public.permissions, public.permission_keys TO "anon"`;
 *   - `20260804180000_platform_anon_privilege_revocation.sql` revokes ALL of it — both broadly
 *     (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`, :138) and forward
 *     (`ALTER DEFAULT PRIVILEGES … REVOKE ALL ON TABLES FROM anon`, :83).
 *
 * So the base-table grant the plan was concerned about is already revoked, and the disagreement it
 * describes — a `GRANT ALL` sitting under a policy scoped `TO authenticated` — no longer depends on
 * "luck of layering". W-60's opening condition is satisfied; what remains open is this lock and
 * `M20`'s drop of the two views.
 *
 * **Scope, and why this file exists separately.** `catalogConsolidationLock.test.ts` already carries
 * the catalog-scoped instance and says so explicitly: *"W-60 owns the general form … this is only
 * the three catalog objects, which are W-9's subject."* This is the general form, over every object
 * that decides authority — membership, role, grant, catalog and scope.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(__dirname, "..", "..", "..", "supabase", "migrations");

/** The migration after which no access-control grant to `anon` may appear. */
const ANON_REVOCATION = "20260804180000_platform_anon_privilege_revocation.sql";

/**
 * Every object that decides authority. Enumerated deliberately and asserted to exist below, because
 * an authority table that is silently absent from this list is exactly the hole the lock exists to
 * prevent — the `W-5` lesson: a stale subject makes a correct assertion vacuous.
 */
const ACCESS_CONTROL_OBJECTS = [
    // membership and role
    "user_roles",
    "role_definitions",
    "role_permission_grants",
    // catalog (canonical + the two compatibility views M20 will drop)
    "permission_definitions",
    "permissions",
    "permission_keys",
    // scope
    "user_access_profiles",
    "user_department_access",
    "user_site_access",
] as const;

type Migration = { name: string; sql: string };

function migrations(): Migration[] {
    return readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((name) => ({
            name,
            // Comments stripped: a migration explaining a historical grant must not be convicted for
            // describing it. This program has twice convicted correct code for its own prose.
            sql: readFileSync(join(migrationsDir, name), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, " ")
                .replace(/--[^\n]*/g, " "),
        }));
}

/** `GRANT <privs> ON [TABLE] <object> TO <grantees>` — grantee list captured up to the statement end. */
const GRANT = /GRANT\s+[\w\s,()]+?\s+ON\s+(?:TABLE\s+)?([\w."]+)\s+TO\s+([^;]*)/gi;

function objectName(raw: string): string {
    return raw.replace(/"/g, "").replace(/^public\./, "");
}

function anonGrantsAfterRevocation(all: Migration[]): string[] {
    const watched = new Set<string>(ACCESS_CONTROL_OBJECTS);
    const offenders: string[] = [];
    for (const m of all) {
        if (m.name <= ANON_REVOCATION) continue;
        for (const [, obj, grantees] of m.sql.matchAll(GRANT)) {
            if (watched.has(objectName(obj)) && /\banon\b/i.test(grantees ?? "")) {
                offenders.push(`${m.name} → ${objectName(obj)}`);
            }
        }
    }
    return offenders;
}

describe("W-60 / S-13 — anon holds no privilege on an access-control object", () => {
    it("the revocation migration this lock is anchored to exists", () => {
        expect(readdirSync(migrationsDir)).toContain(ANON_REVOCATION);
    });

    it("no migration after the revocation grants anon a privilege on any authority object", () => {
        expect(
            anonGrantsAfterRevocation(migrations()),
            "S-13: ALTER DEFAULT PRIVILEGES does not stop an explicit GRANT — Phase 0 proved that",
        ).toEqual([]);
    });

    it("every enumerated object is real, so the subject cannot rot into a vacuous pass", () => {
        const all = migrations()
            .map((m) => m.sql)
            .join("\n");
        for (const obj of ACCESS_CONTROL_OBJECTS) {
            expect(
                new RegExp(String.raw`CREATE\s+(?:TABLE|VIEW|OR\s+REPLACE\s+VIEW)[\s\S]{0,80}?\b${obj}\b`, "i").test(all),
                `${obj} is watched but no migration creates it — the list is stale`,
            ).toBe(true);
        }
    });

    it("bites: an explicit post-revocation grant is convicted", () => {
        // Non-vacuity against the exact statement Phase 0 executed, dated after the revocation.
        const fabricated: Migration[] = [
            {
                name: "20260901000000_fabricated_regression.sql",
                sql: 'GRANT SELECT ON public.role_permission_grants TO "anon", "authenticated";',
            },
        ];
        const offenders = anonGrantsAfterRevocation(fabricated);
        expect(offenders).toHaveLength(1);
        expect(offenders[0]).toContain("role_permission_grants");
    });

    it("does not convict a grant to a non-anon role, nor one before the revocation", () => {
        // The other half of non-vacuity: a lock that convicts everything proves nothing.
        expect(
            anonGrantsAfterRevocation([
                {
                    name: "20260901000000_authenticated_only.sql",
                    sql: 'GRANT SELECT ON public.user_roles TO "authenticated", "service_role";',
                },
            ]),
        ).toEqual([]);
        expect(
            anonGrantsAfterRevocation([
                { name: "20260101000000_before.sql", sql: 'GRANT ALL ON TABLE "public"."user_roles" TO "anon";' },
            ]),
        ).toEqual([]);
    });

    it("the historical grants are real, and all of them predate the revocation", () => {
        // Records the audit rather than asserting a clean history that never existed. If a future
        // edit moved one of these after the revocation, the general lock above would convict it.
        const before = migrations().filter((m) => m.name <= ANON_REVOCATION);
        const historical = new Set<string>();
        for (const m of before) {
            for (const [, obj, grantees] of m.sql.matchAll(GRANT)) {
                if ((ACCESS_CONTROL_OBJECTS as readonly string[]).includes(objectName(obj)) && /\banon\b/i.test(grantees ?? "")) {
                    historical.add(objectName(obj));
                }
            }
        }
        // Six baseline tables plus the two views Phase 0 re-granted.
        expect(historical.size).toBeGreaterThanOrEqual(6);
    });
});
