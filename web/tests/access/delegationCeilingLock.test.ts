/**
 * W-18 — THE DELEGATION CEILING, LOCKED.
 *
 * ── WHAT WAS WRONG ──
 *
 * `isSelfAuthorityMutation` compares the actor to the TARGET USER. That protects every user-targeted
 * authority route and cannot protect the grants route, whose subject is a ROLE. An actor holding
 * nothing but `portal.access` and `settings.users_roles` could add `fin.post` to a role they held and
 * walk away able to post money. It was reproduced against the live function before the fix.
 *
 * ── WHY THE LOCK IS SHAPED LIKE THIS ──
 *
 * The rule lives in one SQL function on purpose: `replace_role_permission_grants` is the only writer
 * of `role_permission_grants` that operator paths reach, and `save_role_definition_and_grants` calls
 * it rather than reimplementing the grants half. So the lock's real job is not to restate the rule —
 * the migration's own self-test does that against a live database — but to make sure the choke point
 * STAYS a choke point: that no route learns to write grants directly, and that the delta semantics
 * are not quietly rewritten into a final-set rule that would make richer roles uneditable.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");
const webRoot = resolve(__dirname, "../..");
const migrations = join(repoRoot, "supabase", "migrations");

function latestCeilingMigration(): string {
    const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
    const named = files.filter((f) => readFileSync(join(migrations, f), "utf8").includes("delegation_ceiling:"));
    expect(named.length, "no migration defines the delegation ceiling").toBeGreaterThan(0);
    return readFileSync(join(migrations, named[named.length - 1]), "utf8");
}

function routeFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const e of entries) {
            const full = join(dir, e);
            if (statSync(full).isDirectory()) walk(full);
            else if (e === "route.ts") out.push(full);
        }
    };
    walk(join(webRoot, "app", "api"));
    return out;
}

describe("W-18 delegation ceiling", () => {
    it("the ceiling exists in the transaction owner, and bounds ADDITIONS rather than the final set", () => {
        const sql = latestCeilingMigration();
        expect(sql, "the ceiling must live in replace_role_permission_grants")
            .toContain("CREATE OR REPLACE FUNCTION public.replace_role_permission_grants");
        expect(sql).toContain("delegation_ceiling:");

        /*
         * The delta, stated as source. `NOT (k = ANY (v_before))` is what makes this a rule about
         * what the actor INTRODUCES: a capability already on the role is not delegation, so it may
         * be kept and may be removed. Without this clause the rule becomes `after ⊆ actor`, which
         * would stop an administrator editing any role richer than themselves without first
         * stripping it — a safety rule that destroys data.
         */
        expect(sql, "the ceiling must compare the ADDED set, not the final set")
            .toContain("NOT (k = ANY (v_before))");

        /*
         * Authority is the union over every role the actor holds. W-17 made multi-role real, so
         * reading one membership row would refuse delegations the actor is entitled to make.
         */
        expect(sql, "actor authority must be the union across all held roles")
            .toMatch(/FROM public\.user_roles ur[\s\S]{0,200}JOIN public\.role_permission_grants g/);
        expect(sql, "the actor's authority must be resolved in the SAME organization as the role")
            .toContain("ur.org_id = p_org_id");
    });

    it("the actor is server-derived, and an unattributed change still fails closed", () => {
        const sql = latestCeilingMigration();
        expect(sql).toContain("p_actor_user_id");
        expect(
            sql,
            "an access change that names no actor must still be refused — the ceiling must not become a way around that",
        ).toContain("audit_actor_required");
    });

    it("no route writes role_permission_grants directly — the choke point stays one function", () => {
        /*
         * NON-VACUITY AND THE REAL RISK IN ONE ASSERTION. A second writer would not fail any test
         * that only reads the SQL: it would simply be a route that never asks. So every API route is
         * scanned, and the two that legitimately touch the table by name are allowed exactly the
         * shapes they use today — a READ in the grants route, and the RPC calls.
         */
        const offenders: string[] = [];
        for (const file of routeFiles()) {
            const src = readFileSync(file, "utf8");
            if (!src.includes("role_permission_grants")) continue;
            const writes = /\.from\("role_permission_grants"\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/.test(src);
            if (writes) offenders.push(file.replace(webRoot + "/", ""));
        }
        expect(
            offenders,
            "a route writing grants directly bypasses the ceiling entirely, whatever the SQL says",
        ).toEqual([]);
    });

    it("both operator entry points surface the refusal as an authorization answer", () => {
        for (const rel of ["app/api/admin/rbac/grants/route.ts", "app/api/admin/rbac/roles/[role_key]/route.ts"]) {
            const src = readFileSync(join(webRoot, rel), "utf8");
            expect(src, `${rel} must translate the ceiling refusal`).toContain("delegation_ceiling:");
            expect(src, `${rel} must answer 403, not 500`).toMatch(/delegation_ceiling[\s\S]{0,700}status: 403/);
        }
    });

    it("every SQL writer of role grants is either the ceiling itself or a named bootstrap seed", () => {
        /*
         * THE ASSERTION THAT ACTUALLY PROTECTS THE INVARIANT.
         *
         * A ceiling inside one function is only a ceiling while that function is the only way in.
         * Role creation, for instance, does NOT call the function this lock's earlier draft named —
         * it calls `create_role_definition_audited`, which delegates its grants half to the guarded
         * function. That delegation is the safety, and it is invisible to any test that checks route
         * files. So this reads the migration tree and enumerates every SQL function that writes the
         * grants table at all.
         *
         * Two bootstrap seeds are listed by name. They provision a NEW organization from the
         * org-creation trigger, have no human actor by construction, and cannot be reached by an
         * operator request — which is why the ceiling neither applies to them nor needs to. Anything
         * else appearing here is a second way to grant authority, and the ceiling would be advisory.
         */
        const SYSTEM_BOOTSTRAP = new Set([
            "seed_default_rbac",
            "seed_integrations_role_grants",
            /*
             * Access Administration Split V1. Provisions the four administration authorities for a
             * NEW organization and removes the retired umbrella. Like its siblings it runs from
             * org-creation with no human actor, so there is no delegating principal to bound — and
             * it is enumerated, so a catalog addition cannot widen a package through it.
             */
            "seed_access_administration_split",
        ]);
        const CEILING_OWNER = "replace_role_permission_grants";

        const writers = new Set<string>();
        for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql"))) {
            const sql = readFileSync(join(migrations, file), "utf8");
            const fn = /CREATE OR REPLACE FUNCTION\s+(?:public\.)?(\w+)\s*\([\s\S]*?(\$\w*\$)([\s\S]*?)\2\s*;/gi;
            let m: RegExpExecArray | null;
            while ((m = fn.exec(sql)) !== null) {
                if (/insert\s+into\s+public\.role_permission_grants/i.test(m[3])) writers.add(m[1]);
            }
        }

        expect(writers.size, "the scan found no grant writers at all — it has stopped reading the tree")
            .toBeGreaterThan(0);
        expect(writers.has(CEILING_OWNER), "the ceiling-bearing function must still write the grants").toBe(true);

        const unexpected = [...writers].filter((w) => w !== CEILING_OWNER && !SYSTEM_BOOTSTRAP.has(w));
        expect(
            unexpected,
            "a new SQL function writes role grants without passing the ceiling; either route it through "
                + CEILING_OWNER + " or justify it here as system bootstrap",
        ).toEqual([]);
    });
});
