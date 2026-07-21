import { describe, expect, it } from "vitest";
import { CONFIGURATION_MODE_NAV_ITEMS } from "@/lib/adminV2/configurationModeNav";
import {
    organizationConfigurationDomain,
    organizationConfigurationDomains,
} from "@/lib/configRuntime/organizationRuntime";
import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";

describe("Organization IA — Programs off landing (Slice 1)", () => {
    it("Organization landing domains exclude Programs and keep Financials", () => {
        const keys = organizationConfigurationDomains().map((d) => d.key);
        expect(keys).not.toContain("programs");
        expect(keys).toContain("financials");
        expect(keys).toContain("locations");
        expect(keys).toHaveLength(9);
    });

    it("Programs domain lookup and canonical route remain intact", () => {
        expect(organizationConfigurationDomain("programs")?.href).toBe(
            CANONICAL_ORGANIZATION_PROGRAMS_HREF,
        );
        expect(organizationConfigurationDomain("commercial")?.key).toBe("programs");
    });

    it("config-mode Business nav no longer lists Programs as a peer", () => {
        expect(CONFIGURATION_MODE_NAV_ITEMS.some((item) => item.href === "/organization/programs")).toBe(
            false,
        );
        expect(CONFIGURATION_MODE_NAV_ITEMS.some((item) => item.href === "/organization/financials")).toBe(
            true,
        );
    });
});
