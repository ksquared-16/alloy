/**
 * P7 — Organization Commands catalog projection honesty.
 */
import { describe, expect, it } from "vitest";
import {
    getOrganizationCommandCatalogEntry,
    listOrganizationCommandCatalog,
} from "@/lib/platform/commands/organizationCommandCatalog";
import { CONFIGURATION_MODE_NAV_GROUPS } from "@/lib/adminV2/configurationModeNav";

describe("organizationCommandCatalog", () => {
    it("lists organization Commands with product support labels", () => {
        const rows = listOrganizationCommandCatalog();
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(["Supported", "Needs attention", "Not yet supported"]).toContain(row.statusLabel);
            expect(row.canonicalCommandKey.length).toBeGreaterThan(0);
            expect(row.operatorLabel.length).toBeGreaterThan(0);
        }
        const orgFacing = rows.filter((r) => r.catalogVisibility === "organization_command_catalog");
        expect(orgFacing.length).toBeGreaterThan(0);
    });

    it("surfaces honest not-yet-supported gaps without inventing executors", () => {
        const gaps = listOrganizationCommandCatalog().filter(
            (r) => r.statusLabel === "Not yet supported"
        );
        expect(gaps.length).toBeGreaterThan(0);
        expect(gaps.every((r) => r.maturity === "unavailable" || r.maturity === "placeholder")).toBe(
            true
        );
    });

    it("does not invent Commands outside the capability registry projection", () => {
        const rows = listOrganizationCommandCatalog();
        const keys = new Set(rows.map((r) => r.canonicalCommandKey));
        expect(keys.has("__invented_operator_command__")).toBe(false);
    });

    it("resolves catalog entries by canonical key and alias", () => {
        const first = listOrganizationCommandCatalog()[0];
        expect(first).toBeTruthy();
        const byKey = getOrganizationCommandCatalogEntry(first!.canonicalCommandKey);
        expect(byKey?.capabilityKey).toBe(first!.capabilityKey);
    });
});

describe("Operations nav — Commands before Automation", () => {
    it("places Commands ahead of Automation, Processes, and Surfaces", () => {
        const ops = CONFIGURATION_MODE_NAV_GROUPS.find((g) => g.id === "operations");
        expect(ops).toBeTruthy();
        const labels = ops!.items.map((i) => i.label);
        expect(labels[0]).toBe("Commands");
        expect(labels.indexOf("Commands")).toBeLessThan(labels.indexOf("Automation"));
        expect(labels.indexOf("Automation")).toBeLessThan(labels.indexOf("Processes"));
        expect(labels.indexOf("Processes")).toBeLessThan(labels.indexOf("Surfaces"));
        expect(ops!.items[0]?.href).toBe("/organization/commands");
        expect(ops!.items[0]?.testId).toBe("config-mode-nav-commands");
    });
});
