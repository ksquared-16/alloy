/**
 * Corrective: Commands must appear on the real Organization Configuration domain grid.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    organizationConfigurationDomain,
    organizationConfigurationDomains,
} from "@/lib/configRuntime/organizationRuntime";
import { CONFIGURATION_MODE_NAV_GROUPS } from "@/lib/adminV2/configurationModeNav";
import { CANONICAL_ORGANIZATION_COMMANDS_HREF } from "@/lib/admin/canonicalAdminRoutes";

const root = resolve(__dirname, "../..");

describe("Organization Configuration — Commands product integration", () => {
    it("registers Commands on the /organization domain grid ahead of Automation → Processes → Surfaces", () => {
        const keys = organizationConfigurationDomains().map((d) => d.key);
        const commandsIdx = keys.indexOf("commands");
        const automationIdx = keys.indexOf("automation");
        const processesIdx = keys.indexOf("business-processes");
        const surfacesIdx = keys.indexOf("surfaces");
        expect(commandsIdx).toBeGreaterThan(-1);
        expect(commandsIdx).toBeLessThan(automationIdx);
        expect(automationIdx).toBeLessThan(processesIdx);
        expect(processesIdx).toBeLessThan(surfacesIdx);

        const commands = organizationConfigurationDomain("commands");
        expect(commands?.label).toBe("Commands");
        expect(commands?.href).toBe(CANONICAL_ORGANIZATION_COMMANDS_HREF);
        expect(commands?.href).toBe("/organization/commands");
    });

    it("keeps sidebar Operations order aligned with the domain grid", () => {
        const ops = CONFIGURATION_MODE_NAV_GROUPS.find((g) => g.id === "operations");
        const labels = ops?.items.map((i) => i.label) ?? [];
        expect(labels.slice(0, 4)).toEqual([
            "Commands",
            "Automation",
            "Processes",
            "Surfaces",
        ]);
    });

    it("Organization Configuration page maps a Commands icon", () => {
        const page = readFileSync(
            resolve(root, "components/adminV2/settings/organization/OrganizationConfigurationPage.tsx"),
            "utf8"
        );
        expect(page).toContain("commands: Command");
        expect(page).toContain("DOMAIN_ICONS");
    });

    it("Commands product links back to Organization Configuration", () => {
        const client = readFileSync(
            resolve(root, "components/adminV2/settings/commands/CommandsConfigurationPage.tsx"),
            "utf8"
        );
        expect(client).toContain('href="/organization"');
        expect(client).toContain("commands-back-to-organization");
    });
});
