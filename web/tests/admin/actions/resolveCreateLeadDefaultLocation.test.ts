import { describe, expect, it } from "vitest";
import {
    applyCreateLeadDefaultLocationToValues,
    resolveCreateLeadDefaultLocation,
    shouldApplyImpliedCreateLeadLocation,
} from "@/lib/admin/actions/resolveCreateLeadDefaultLocation";

describe("resolveCreateLeadDefaultLocation", () => {
    it("prefers workspace site over single permitted site", () => {
        const result = resolveCreateLeadDefaultLocation({
            workspaceSiteId: "site-workspace",
            permittedSiteIds: ["site-only"],
        });
        expect(result).toEqual({ location_id: "site-workspace", source: "workspace_site" });
    });

    it("uses form location when already set", () => {
        const result = resolveCreateLeadDefaultLocation({
            formLocationId: "site-form",
            workspaceSiteId: "site-workspace",
        });
        expect(result).toEqual({ location_id: "site-form", source: "form_value" });
    });

    it("uses single permitted site when workspace unset", () => {
        const result = resolveCreateLeadDefaultLocation({
            permittedSiteIds: ["site-a"],
        });
        expect(result).toEqual({ location_id: "site-a", source: "single_permitted_site" });
    });

    it("applyCreateLeadDefaultLocationToValues seeds location_id", () => {
        const next = applyCreateLeadDefaultLocationToValues(
            {},
            { location_id: "site-a", source: "workspace_site" },
        );
        expect(next.location_id).toBe("site-a");
    });
});

describe("shouldApplyImpliedCreateLeadLocation", () => {
    it("applies when draft location is empty and workspace implies a site", () => {
        expect(
            shouldApplyImpliedCreateLeadLocation({
                currentLocationId: "",
                impliedLocationId: "site-north",
            }),
        ).toBe(true);
    });

    it("does not apply when All locations / no implication", () => {
        expect(
            shouldApplyImpliedCreateLeadLocation({
                currentLocationId: "",
                impliedLocationId: null,
            }),
        ).toBe(false);
    });

    it("does not clobber an operator-entered location", () => {
        expect(
            shouldApplyImpliedCreateLeadLocation({
                currentLocationId: "site-south",
                impliedLocationId: "site-north",
                currentIsWorkspaceImplied: false,
            }),
        ).toBe(false);
    });

    it("updates when a prior workspace-implied location should track a new campus", () => {
        expect(
            shouldApplyImpliedCreateLeadLocation({
                currentLocationId: "site-south",
                impliedLocationId: "site-north",
                currentIsWorkspaceImplied: true,
            }),
        ).toBe(true);
    });
});
