import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { organizationConfigurationDomain } from "@/lib/configRuntime/organizationRuntime";
import { CANONICAL_ORGANIZATION_CALCULATIONS_HREF } from "@/lib/admin/canonicalAdminRoutes";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

describe("Organization Calculations proving product", () => {
    it("registers domain + canonical route to /organization/calculations", () => {
        expect(CANONICAL_ORGANIZATION_CALCULATIONS_HREF).toBe("/organization/calculations");
        expect(organizationConfigurationDomain("organization-calculations")?.href).toBe(
            CANONICAL_ORGANIZATION_CALCULATIONS_HREF,
        );
        expect(read("next.config.ts")).toContain('source: "/organization/calculations"');
        expect(read("app/adminV2/settings/organization/calculations/page.tsx")).toContain(
            "OrganizationCalculationsWorkspace",
        );
    });

    it("exposes admin APIs for author → publish → evaluate → runtime consume", () => {
        expect(read("app/api/admin/organization-calculations/route.ts")).toContain("createOrganizationCalculationDraft");
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
        expect(read("app/api/admin/organization-calculations/catalog/route.ts")).toContain(
            "listOrganizationCalculationCatalog",
        );
    });

    it("mounts runtime consumer on room capacity detail without replacing capacity", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        expect(panel).toContain("RoomOrganizationCalculationPanel");
        expect(panel).toContain("locations-room-metric-");
        expect(panel).toContain('key: "capacity"');
        expect(read("components/adminV2/settings/locations/RoomOrganizationCalculationPanel.tsx")).toContain(
            "/api/admin/organization-calculations/runtime",
        );
    });

    it("authoring UI is structured templates, not a freeform formula builder", () => {
        const ui = read(
            "components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace.tsx",
        );
        expect(ui).toContain("provingMinPhysicalLicensedAst");
        expect(ui).toContain("not a freeform formula builder");
        expect(ui).not.toContain("eval(");
        expect(ui).not.toContain("Function(");
    });
});
