import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { organizationConfigurationDomain, organizationConfigurationDomains } from "@/lib/configRuntime/organizationRuntime";
import { CANONICAL_ORGANIZATION_CALCULATIONS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    ORG_CALC_PRODUCT_TYPES,
    inferProductTypeFromAst,
    productTypeById,
} from "@/lib/organizationCalculations/productCatalog";
import { provingMinPhysicalLicensedAst } from "@/lib/organizationCalculations/ast";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

describe("Organization Calculations V1 product", () => {
    it("registers domain + canonical route to /organization/calculations", () => {
        expect(CANONICAL_ORGANIZATION_CALCULATIONS_HREF).toBe("/organization/calculations");
        expect(organizationConfigurationDomain("organization-calculations")?.href).toBe(
            CANONICAL_ORGANIZATION_CALCULATIONS_HREF,
        );
        expect(organizationConfigurationDomain("organization-calculations")?.label).toBe(
            "Calculation library",
        );
        expect(
            organizationConfigurationDomains().some((d) => d.key === "organization-calculations"),
        ).toBe(false);
        expect(read("next.config.ts")).toContain('source: "/organization/calculations"');
        expect(read("app/adminV2/settings/organization/calculations/page.tsx")).toContain(
            "OrganizationCalculationsWorkspace",
        );
    });

    it("exposes admin APIs for author → publish → evaluate → usage → restore", () => {
        expect(read("app/api/admin/organization-calculations/route.ts")).toContain(
            "listOrganizationCalculationsForProduct",
        );
        expect(read("app/api/admin/organization-calculations/route.ts")).toContain("product_type_id");
        expect(read("app/api/admin/organization-calculations/[id]/publish/route.ts")).toContain(
            "publishOrganizationCalculation",
        );
        expect(read("app/api/admin/organization-calculations/[id]/evaluate/route.ts")).toContain(
            "evaluateOrganizationCalculationForRoom",
        );
        expect(read("app/api/admin/organization-calculations/runtime/route.ts")).toContain(
            "listPublishedRuntimeSurfaceCalculations",
        );
        expect(read("app/api/admin/organization-calculations/[id]/bind-runtime/route.ts")).toContain(
            "bindRuntimeSurfaceVersion",
        );
        expect(read("app/api/admin/organization-calculations/[id]/archive/route.ts")).toContain(
            "archiveOrganizationCalculation",
        );
        expect(read("app/api/admin/organization-calculations/[id]/restore/route.ts")).toContain(
            "restoreOrganizationCalculation",
        );
    });

    it("mounts room capacity consumer without replacing platform capacity", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        expect(panel).toContain("RoomOrganizationCalculationPanel");
        expect(panel).toContain("locations-room-metric-");
        expect(panel).toContain('key: "capacity"');
        const consumer = read("components/adminV2/settings/locations/RoomOrganizationCalculationPanel.tsx");
        expect(consumer).toContain("/api/admin/organization-calculations/runtime");
        expect(consumer).not.toContain("AST");
        expect(consumer).not.toContain("runtime_surface");
    });

    it("product UI is guided templates with business language — not a formula builder", () => {
        const ui = read(
            "components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace.tsx",
        );
        expect(ui).toContain("organization-calculations-domain-home");
        expect(ui).toContain("organization-calculations-new-wizard");
        expect(ui).toContain("Choose calculation type");
        expect(ui).toContain("ORG_CALC_PRODUCT_TYPES");
        expect(ui).toContain("Overview");
        expect(ui).toContain("Definition");
        expect(ui).toContain("Versions");
        expect(ui).toContain("Usage");
        expect(ui).toContain("Lifecycle");
        expect(ui).not.toContain("provingMinPhysicalLicensedAst");
        expect(ui).not.toContain("eval(");
        expect(ui).not.toContain("Function(");
        expect(ui).not.toMatch(/\bAST\b/);
        expect(ui).not.toContain("registry key");
        expect(ui).not.toContain("canonical scalar");
        expect(ui).not.toContain("Typed evaluator");
        expect(ui).not.toContain("Consumer binding");
        expect(ui).not.toContain("Version UUID");
    });

    it("exposes exactly two supported product types today", () => {
        expect(ORG_CALC_PRODUCT_TYPES).toHaveLength(2);
        expect(productTypeById("capacity_lowest_physical_licensed")?.typeLabel).toBe("Capacity");
        expect(productTypeById("capacity_operational_with_fallback")?.typeLabel).toBe("Operational capacity");
        expect(inferProductTypeFromAst(provingMinPhysicalLicensedAst()).id).toBe(
            "capacity_lowest_physical_licensed",
        );
        expect(
            inferProductTypeFromAst({
                kind: "call",
                fn: "coalesce",
                args: [{ kind: "input", ref: "capacity.room_binding.operational" }],
            }).id,
        ).toBe("capacity_operational_with_fallback");
    });

    it("domain card uses administrator language", () => {
        const domain = organizationConfigurationDomain("organization-calculations");
        expect(domain?.runtimeOwner).not.toMatch(/AST/i);
        expect(domain?.description).not.toMatch(/AST|registry|projection/i);
        expect(JSON.stringify(domain?.ownedConfiguration)).not.toMatch(/binding/i);
    });
});
