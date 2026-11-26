import { describe, expect, it } from "vitest";
import {
    commandProductSupport,
    groupOperationalExposures,
    commandPurpose,
} from "@/lib/platform/commands/commandProductPresentation";
import { getOrganizationCommandCatalogEntry } from "@/lib/platform/commands/organizationCommandCatalog";

describe("commandProductPresentation", () => {
    it("maps create_lead to Supported with plain-language purpose", () => {
        const entry = getOrganizationCommandCatalogEntry("create_lead");
        expect(entry).toBeTruthy();
        expect(commandPurpose(entry!)).toMatch(/lead/i);
        const support = commandProductSupport(entry!);
        expect(support.state).toBe("supported");
        expect(support.label).toBe("Supported");
        expect(support.label).not.toMatch(/Limited/i);
    });

    it("does not use Limited as administrator support language", () => {
        const entry = getOrganizationCommandCatalogEntry("create_lead");
        expect(entry?.statusLabel).not.toBe("Limited");
        expect(["Supported", "Needs attention", "Not yet supported", "Internal", "Hidden"]).toContain(
            entry!.statusLabel
        );
    });

    it("collapses duplicate placement rows into one operational exposure", () => {
        const groups = groupOperationalExposures([
            {
                id: "a",
                orgOwned: true,
                surface: "department",
                slot: "primary",
                entityType: "opportunity",
                sectionKey: null,
                isActive: true,
                orderIndex: 0,
            },
            {
                id: "b",
                orgOwned: true,
                surface: "department",
                slot: "primary",
                entityType: "opportunity",
                sectionKey: null,
                isActive: false,
                orderIndex: 1,
            },
            {
                id: "c",
                orgOwned: false,
                surface: "queue_row",
                slot: "primary",
                entityType: "opportunity",
                sectionKey: null,
                isActive: true,
                orderIndex: 0,
            },
        ]);
        expect(groups).toHaveLength(2);
        const dept = groups.find((g) => g.key.startsWith("department|"));
        expect(dept?.memberCount).toBe(2);
        expect(dept?.orgEditable).toBe(true);
        expect(dept?.orgPlacementIds).toEqual(["a", "b"]);
        expect(dept?.title).toMatch(/Department workspace/i);
        expect(dept?.note).toMatch(/collapsed/i);
        const queue = groups.find((g) => g.key.startsWith("queue_row|"));
        expect(queue?.orgEditable).toBe(false);
    });
});
