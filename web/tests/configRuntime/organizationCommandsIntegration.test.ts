/**
 * Product-boundary: Commands is NOT an Organization Configuration domain.
 * Sequence is Automation → Business Processes → Surfaces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    organizationConfigurationDomain,
    organizationConfigurationDomains,
} from "@/lib/configRuntime/organizationRuntime";
import {
    CONFIGURATION_MODE_INTERNAL_NAV_ITEMS,
    CONFIGURATION_MODE_NAV_GROUPS,
} from "@/lib/adminV2/configurationModeNav";
import { CANONICAL_ORGANIZATION_COMMANDS_HREF } from "@/lib/admin/canonicalAdminRoutes";

const root = resolve(__dirname, "../..");

describe("Organization Configuration — Commands product-boundary correction", () => {
    it("does not register Commands on the /organization domain grid", () => {
        const keys = organizationConfigurationDomains().map((d) => d.key);
        expect(keys).not.toContain("commands");
        expect(organizationConfigurationDomain("commands")).toBeNull();

        const automationIdx = keys.indexOf("automation");
        const processesIdx = keys.indexOf("business-processes");
        const surfacesIdx = keys.indexOf("surfaces");
        expect(automationIdx).toBeGreaterThan(-1);
        expect(automationIdx).toBeLessThan(processesIdx);
        expect(processesIdx).toBeLessThan(surfacesIdx);
    });

    it("keeps sidebar Operations as Automation → Processes → Surfaces", () => {
        const ops = CONFIGURATION_MODE_NAV_GROUPS.find((g) => g.id === "operations");
        const labels = ops?.items.map((i) => i.label) ?? [];
        expect(labels).not.toContain("Commands");
        expect(labels.slice(0, 3)).toEqual(["Automation", "Processes", "Surfaces"]);
    });

    it("retains diagnostics only on the internal nav", () => {
        const diag = CONFIGURATION_MODE_INTERNAL_NAV_ITEMS.find(
            (i) => i.href === CANONICAL_ORGANIZATION_COMMANDS_HREF
        );
        expect(diag?.label).toMatch(/diagnostics/i);
        expect(diag?.internal).toBe(true);
    });

    it("Organization Configuration page does not map a Commands domain icon", () => {
        const page = readFileSync(
            resolve(root, "components/adminV2/settings/organization/OrganizationConfigurationPage.tsx"),
            "utf8"
        );
        expect(page).not.toContain("commands: Command");
    });
});
