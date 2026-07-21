import { describe, expect, it } from "vitest";
import {
    buildOrganizationDefaultImpactPreview,
    configurationOwnershipLabel,
    resolveProgramOfferingOwnership,
    resolveTuitionCellOwnership,
} from "@/lib/configRuntime/organizationLocationScope";

describe("organizationLocationScope", () => {
    it("labels ownership sources for operator display", () => {
        expect(configurationOwnershipLabel("organization_default")).toBe("Organization default");
        expect(configurationOwnershipLabel("inherited")).toBe("Inherited from Organization");
        expect(configurationOwnershipLabel("location_override", "North Campus")).toBe(
            "Overridden by North Campus",
        );
        expect(configurationOwnershipLabel("not_assigned")).toBe("Not assigned");
    });

    it("resolves tuition cell ownership without inventing field-level inheritance", () => {
        expect(resolveTuitionCellOwnership({ hasLocationRow: false, locationId: null })).toBe(
            "organization_default",
        );
        expect(resolveTuitionCellOwnership({ hasLocationRow: false, locationId: "loc-1" })).toBe(
            "inherited",
        );
        expect(resolveTuitionCellOwnership({ hasLocationRow: true, locationId: "loc-1" })).toBe(
            "location_override",
        );
    });

    it("resolves program offering ownership at description/assignment grain", () => {
        expect(
            resolveProgramOfferingOwnership({
                hasProgramRevision: false,
                hasLocalDescriptionOverride: false,
            }),
        ).toBe("location_required");
        expect(
            resolveProgramOfferingOwnership({
                hasProgramRevision: true,
                hasLocalDescriptionOverride: false,
            }),
        ).toBe("inherited");
        expect(
            resolveProgramOfferingOwnership({
                hasProgramRevision: true,
                hasLocalDescriptionOverride: true,
            }),
        ).toBe("location_override");
    });

    it("builds Organization-default impact preview excluding overridden Locations", () => {
        const preview = buildOrganizationDefaultImpactPreview({
            locations: [
                { id: "n", label: "North Campus", hasOverride: false },
                { id: "s", label: "South Campus", hasOverride: false },
                { id: "e", label: "East Campus", hasOverride: true },
            ],
        });
        expect(preview.willUpdate.map((row) => row.label)).toEqual(["North Campus", "South Campus"]);
        expect(preview.excludedOverrides).toEqual([
            {
                id: "e",
                label: "East Campus",
                reason: "Has a Location override and will not change",
            },
        ]);
    });
});
