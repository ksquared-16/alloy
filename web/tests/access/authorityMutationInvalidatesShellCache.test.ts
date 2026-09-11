/**
 * W-13 — AN AUTHORITY CHANGE MUST REACH THE NEXT REQUEST, NOT THE ONE AFTER THE CACHE EXPIRES.
 *
 * `adminShellContextCache` holds a resolved access bundle per user for 120 seconds so navigation
 * routes do not re-pay `resolveAdminAccessCore` at ~1.1s each. Its own docstring said *"mutations
 * must not rely on this cache for authorization; call `invalidateAdminShellContextCache` on
 * logout/org switch"* — and nothing in the product tree had ever called it.
 *
 * That was survivable while the bundle held only capabilities: a stale capability set is a stale
 * screen, and every gate that mattered resolved its own key. W-13 put ADMISSION in the same bundle,
 * so the same staleness became *revoked portal access that still opens the portal* — for up to two
 * minutes, depending on when the affected operator last loaded a page. That is the one outcome a
 * revocation proof has to rule out.
 *
 * ── WHY THIS IS A SCAN AND NOT A CALL ──
 *
 * The subject is "every route that mutates authority", which is a set that grows. Asserting it over
 * the discovered set rather than over four names is what makes the fifth route fail here rather than
 * ship with a two-minute revocation window nobody measures. The route bodies are not executed
 * because their authorization, their RPCs and their transactions are covered elsewhere; what is
 * uncovered — and was missing — is the single call.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const webRoot = join(__dirname, "..", "..");
const INVALIDATE = "invalidateAdminShellContextCache";

function routeFiles(): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (entry === "route.ts") out.push(p);
        }
    };
    walk(join(webRoot, "app/api/admin"));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

function executable(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * A route that CHANGES what a principal may do: it replaces a role's grants, or writes/deletes a
 * membership row.
 *
 * Reads are excluded by requiring a write verb against the authority tables — a route that only
 * SELECTs from `user_roles` changes nothing and has nothing to invalidate.
 */
function authorityMutators(): string[] {
    return routeFiles().filter((rel) => {
        const src = executable(rel);
        const grantWrite = /rpc\(\s*"(?:replace_role_permission_grants|save_role_definition_and_grants)"/.test(src);
        const membershipWrite =
            /from\("user_roles"\)[\s\S]{0,200}?\.(?:insert|upsert|delete|update)\(/.test(src)
            || /replaceMembershipWithAccessProfile\(/.test(src);
        return grantWrite || membershipWrite;
    });
}

describe("authority mutations clear the admin shell context cache", () => {
    const mutators = authorityMutators();

    it("finds the routes it is asserting over (not vacuous)", () => {
        // The four that existed when this was written. A scan that found none would pass the
        // assertion below by agreeing with nothing.
        expect(mutators.length).toBeGreaterThanOrEqual(4);
        expect(mutators).toContain("app/api/admin/rbac/grants/route.ts");
        expect(mutators).toContain("app/api/admin/rbac/roles/[role_key]/route.ts");
        expect(mutators).toContain("app/api/admin/users/[userId]/role/route.ts");
        expect(mutators).toContain("app/api/admin/users/[userId]/remove/route.ts");
    });

    it("every one of them invalidates", () => {
        const missing = mutators.filter((rel) => !executable(rel).includes(INVALIDATE));
        expect(
            missing,
            "a route changes authority and leaves a resolved bundle — which now carries portal "
                + "admission — cached for up to 120s. Call invalidateAdminShellContextCache after the write.",
        ).toEqual([]);
    });

    it("a grant change clears every user, a membership change clears its own", () => {
        /*
         * The distinction is not style. A role's grants belong to every principal holding the role
         * and the route does not know who they are, so a per-user call there would leave everyone
         * else stale. A membership change has exactly one subject, and clearing the whole cache for
         * it would evict every other operator's bundle to fix one.
         */
        for (const rel of ["app/api/admin/rbac/grants/route.ts", "app/api/admin/rbac/roles/[role_key]/route.ts"]) {
            expect(executable(rel), rel).toMatch(/invalidateAdminShellContextCache\(\s*\)/);
        }
        for (const rel of ["app/api/admin/users/[userId]/role/route.ts", "app/api/admin/users/[userId]/remove/route.ts"]) {
            expect(executable(rel), rel).toMatch(/invalidateAdminShellContextCache\(\s*userId\s*\)/);
        }
    });

    it("there is still exactly one access cache", () => {
        // The instruction that produced W-13 forbids a second one, and the fix above is the reason
        // to say so here: reaching for a new cache is the obvious wrong way to make revocation
        // prompt. The module below is it.
        const src = readFileSync(join(webRoot, "lib/adminV2/adminShellContextCache.ts"), "utf8");
        expect(src).toContain("ADMIN_SHELL_CONTEXT_CACHE_TTL_MS = 120_000");
        expect(src).toMatch(/processMap<string, CacheEntry>\("admin_shell_context"\)/);
    });
});
