import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveAdminAccessCore,
    resolveAdminAccessDimensionsForOrgMember,
    chooseOrgAndRoleKeysFromMembershipRows,
    normalizeRoleKey,
} from "@/lib/admin/resolveAdminAccessCore";
import { resolveAdminPortalOrgCore } from "@/lib/admin/resolveAdminPortalOrgCore";

/**
 * W-42 (`I-28`ᴬ, `RL-24`) — one normal form, applied once, at the boundary.
 *
 * `F14` in the plan's fixture table: `"admin "`, `"Admin"`, `"admin"` — full access, any scope,
 * *"one normal form; preview ≡ runtime on whitespace and case."*
 *
 * The defect (`02…§18`, `M2-11`): the enforcing resolver built `roleKeys` RAW and the preview built
 * them TRIMMED, so for a membership row holding `"admin "` the enforcing path yielded
 * `portalEligible: false` with an empty capability set while the preview yielded
 * `portalEligible: true` with the full `admin` grant set — *"Settings → Users & Roles shows a
 * working portal administrator; every runtime gate returns 401/403."*
 */

const ORG = "org-1";
const USER = "user-1";

function builder(data: unknown) {
    const b: Record<string, unknown> = {};
    b.eq = () => b;
    b.in = () => b;
    b.order = () => b;
    b.maybeSingle = () => Promise.resolve({ data, error: null });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(res, rej);
    return b;
}

/** A membership whose stored role is exactly `storedRole`, with an `admin` grant configured. */
function mockSupabase(storedRole: string): SupabaseClient {
    const from = vi.fn((table: string) => ({
        select: () => {
            switch (table) {
                case "user_roles":
                    return builder([{ org_id: ORG, role: storedRole }]);
                case "role_permission_grants":
                    return builder([{ permission_key: "settings.users_roles" }]);
                case "user_access_profiles":
                    return builder({ department_scope: "all", site_scope: "all" });
                default:
                    return builder([]);
            }
        },
    }));
    return { from } as unknown as SupabaseClient;
}

const VARIANTS = ["admin", "admin ", " admin", "Admin", "ADMIN", "  AdMiN  "] as const;

describe("W-42 — the normal form is one function", () => {
    it("trims and lowercases", () => {
        for (const v of VARIANTS) expect(normalizeRoleKey(v)).toBe("admin");
    });

    it("is total on non-strings rather than throwing", () => {
        expect(normalizeRoleKey(null)).toBe("");
        expect(normalizeRoleKey(undefined)).toBe("");
        expect(normalizeRoleKey(42)).toBe("");
    });
});

describe("W-42 / F14 — preview ≡ runtime on whitespace and case", () => {
    it.each(VARIANTS)("stored role %o resolves identically in both resolvers", async (stored) => {
        const core = await resolveAdminAccessCore(mockSupabase(stored), USER);
        const preview = await resolveAdminAccessDimensionsForOrgMember(mockSupabase(stored), USER, ORG);

        expect(core?.roleKeys).toEqual(["admin"]);
        expect(preview?.roleKeys).toEqual(["admin"]);
        expect(core?.roleKeys).toEqual(preview?.roleKeys);
        expect(core?.permissionKeys).toEqual(preview?.permissionKeys);

        // The half that was actually broken: a padded row matched no PORTAL_ROLE, so the enforcing
        // path refused a principal the preview rendered as a working administrator.
        expect(core?.portalEligible).toBe(true);
        expect(preview?.portalEligible).toBe(true);
        expect(core?.portalEligible).toBe(preview?.portalEligible);
    });

    it("the third resolver agrees too", async () => {
        for (const stored of VARIANTS) {
            const portal = await resolveAdminPortalOrgCore(mockSupabase(stored), USER);
            expect(portal?.roleKeys).toEqual(["admin"]);
            expect(portal?.portalEligible).toBe(true);
        }
    });

    it("a genuinely different role is still a different role — normalization is not collapse", async () => {
        const core = await resolveAdminAccessCore(mockSupabase("regional_lead"), USER);
        expect(core?.roleKeys).toEqual(["regional_lead"]);
        expect(core?.portalEligible).toBe(false);
    });

    it("variants of one role collapse to a single key rather than several", () => {
        const picked = chooseOrgAndRoleKeysFromMembershipRows([
            { org_id: ORG, role: "admin" },
            { org_id: ORG, role: "Admin " },
            { org_id: ORG, role: " ADMIN" },
        ]);
        expect(picked?.roleKeys).toEqual(["admin"]);
    });

    it("an all-whitespace role is dropped, not carried as an empty key", () => {
        expect(chooseOrgAndRoleKeysFromMembershipRows([{ org_id: ORG, role: "   " }])).toBeNull();
    });
});

describe("W-42 Tier A — no resolver module trims a role key on its own", () => {
    const MODULES = [
        "lib/admin/resolveAdminAccessCore.ts",
        "lib/admin/resolveAdminPortalOrgCore.ts",
    ] as const;

    it.each(MODULES)("%s routes role normalization through normalizeRoleKey", (relPath) => {
        const source = readFileSync(join(process.cwd(), relPath), "utf8");
        // The one definition is allowed to trim; nothing else may.
        const body = source.replace(
            /export function normalizeRoleKey[\s\S]*?\n\}/,
            "/* normalizeRoleKey definition */"
        );
        const offenders = body
            .split("\n")
            .map((line, i) => ({ line: i + 1, text: line }))
            .filter(({ text }) => /\brole\b/i.test(text) && /\.trim\(\)|\.toLowerCase\(\)/.test(text))
            .filter(({ text }) => !text.trimStart().startsWith("*") && !text.trimStart().startsWith("//"));
        expect(
            offenders.map((o) => `line ${o.line}: ${o.text.trim()}`),
            "a second normalization is a second normal form — I-28ᴬ"
        ).toEqual([]);
    });

    it("bites: a local role trim is detected", () => {
        const regressed = 'const ar = auRow.role.trim();';
        const offenders = regressed
            .split("\n")
            .filter((text) => /\brole\b/i.test(text) && /\.trim\(\)|\.toLowerCase\(\)/.test(text));
        expect(offenders.length).toBe(1);
    });
});
