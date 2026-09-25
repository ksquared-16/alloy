/**
 * Who may author a safeguarding restriction — and who may never reach the capability at all.
 *
 * The write path holds a service-role client, so row-level security is NOT the enforcement here.
 * If `safeguardingAuthority` stops refusing, nothing else does. These assertions are the reason the
 * module is allowed to exist as a plain function rather than a database policy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    SAFEGUARDING_MANAGE_ROLES,
    SAFEGUARDING_VIEW_ROLES,
    canManageSafeguarding,
    canViewSafeguarding,
} from "@/lib/safeguarding/safeguardingAuthority";
import { SAFEGUARDING_PERMISSIONS } from "@/lib/safeguarding/safeguardingRestriction";

const REPO = resolve(__dirname, "../../..");

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out;
}

describe("safeguarding manage authority", () => {
    it("admits exactly owner and admin", () => {
        expect(canManageSafeguarding(["owner"])).toBe(true);
        expect(canManageSafeguarding(["admin"])).toBe(true);
        expect([...SAFEGUARDING_MANAGE_ROLES].sort()).toEqual(["admin", "owner"]);
    });

    it("refuses ops, who may READ restrictions but not author them", () => {
        // Authoring or lifting a restriction is an approval. Reading one is not.
        expect(canManageSafeguarding(["ops"])).toBe(false);
        expect(canViewSafeguarding(["ops"])).toBe(true);
    });

    it("refuses manager, who may not even read", () => {
        // The table's SELECT policy deliberately omits manager: a child's protective order must not
        // read like ordinary profile content.
        expect(canViewSafeguarding(["manager"])).toBe(false);
        expect(canManageSafeguarding(["manager"])).toBe(false);
        expect(SAFEGUARDING_VIEW_ROLES).not.toContain("manager");
    });

    it("refuses a caller with no roles, and a caller with only unrelated custom roles", () => {
        expect(canManageSafeguarding([])).toBe(false);
        expect(canViewSafeguarding([])).toBe(false);
        expect(canManageSafeguarding(["mcert_enroll_decide", "mcert_forms_titular"])).toBe(false);
    });

    it("is not fooled by whitespace or a near-miss role name", () => {
        expect(canManageSafeguarding([" admin "])).toBe(true);
        expect(canManageSafeguarding(["administrator"])).toBe(false);
        expect(canManageSafeguarding(["org_admin"])).toBe(false);
        expect(canManageSafeguarding(["Admin"])).toBe(false);
    });

    it("does not gate on the unseeded permission key, which would refuse everyone forever", () => {
        // The key is declared but deliberately absent from `permission_definitions`, so it can never
        // appear in a caller's resolved permissionKeys. Gating on it would make the capability
        // uninvokable — safe, and useless.
        const source = readFileSync(resolve(REPO, "web/lib/safeguarding/safeguardingAuthority.ts"), "utf8");
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(code).not.toContain(SAFEGUARDING_PERMISSIONS.manage);
        expect(code).not.toContain("permissionKeys");
    });
});

describe("safeguarding is unreachable from the public platform", () => {
    const publicApi = resolve(REPO, "web/app/api/v1");

    it("no /api/v1 route references the safeguarding table", () => {
        const offenders = walk(publicApi).filter((f) =>
            readFileSync(f, "utf8").includes("child_safeguarding_restrictions"),
        );
        expect(offenders).toEqual([]);
    });

    it("no /api/v1 route imports the safeguarding writer", () => {
        const offenders = walk(publicApi).filter((f) =>
            readFileSync(f, "utf8").includes("childSafeguardingRestrictionService"),
        );
        expect(offenders).toEqual([]);
    });

    it("the public scope catalog grants nothing over safeguarding", () => {
        const catalog = readFileSync(resolve(REPO, "web/lib/platform/external/scopeCatalog.ts"), "utf8");
        expect(catalog.toLowerCase()).not.toContain("safeguarding.write");
        expect(catalog.toLowerCase()).not.toContain("safeguarding.manage");
        expect(catalog).not.toContain("safeguarding.read");
    });

    it("the published OpenAPI describes no safeguarding path, field or schema", () => {
        const spec = readFileSync(
            resolve(REPO, "docs/api/developer-platform/package/03-openapi/alloy-public-api.v1.json"),
            "utf8",
        );
        const doc = JSON.parse(spec) as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
        for (const path of Object.keys(doc.paths)) {
            expect(path.toLowerCase()).not.toContain("safeguard");
            expect(path.toLowerCase()).not.toContain("restriction");
        }
        // A field named for a restriction would leak the existence of one even when null.
        for (const [name, schema] of Object.entries(doc.components.schemas)) {
            const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
            for (const prop of Object.keys(props)) {
                expect(prop.toLowerCase(), `${name}.${prop}`).not.toContain("safeguard");
                expect(prop.toLowerCase(), `${name}.${prop}`).not.toContain("restriction");
            }
        }
    });

    it("the operator surface lives under /api/admin, never under /api/v1", () => {
        const adminRoute = resolve(
            REPO,
            "web/app/api/admin/children/[childId]/safeguarding-restrictions/route.ts",
        );
        expect(readFileSync(adminRoute, "utf8")).toContain("addChildSafeguardingRestriction");
    });
});
