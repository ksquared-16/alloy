/**
 * Platform Simplification Sprint — Phase 2: Global Search campus → canonical location surface.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalLocationSettingsHref, parseLocationSettingsLocationId } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { resolveGlobalSearchLocationSettingsHref } from "@/lib/admin/globalSearch/globalRecordSearchLocationNavigation";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function campusHit(id: string): GlobalRecordSearchHit {
    return {
        entity_type: "locations",
        entity_id: id,
        group: "locations",
        open_entity_type: "locations",
        open_entity_id: id,
        name: "North Campus",
        type_label: "Campus",
        household_name: null,
        opportunity_name: null,
        lead_short_label: null,
        status_label: null,
        location_label: "North Campus",
    };
}

describe("platform simplification phase 2 — search campus navigation", () => {
    it("builds canonical settings location deep links", () => {
        expect(canonicalLocationSettingsHref("site-abc")).toBe("/organization/locations?locationId=site-abc");
        expect(parseLocationSettingsLocationId("site-abc")).toBe("site-abc");
        expect(parseLocationSettingsLocationId("")).toBeNull();
    });

    it("resolves campus search hits to settings locations href", () => {
        expect(resolveGlobalSearchLocationSettingsHref(campusHit("site-1"))).toBe(
            "/organization/locations?locationId=site-1",
        );
        expect(
            resolveGlobalSearchLocationSettingsHref({
                ...campusHit("site-1"),
                open_entity_type: "persons",
                open_entity_id: "person-1",
            }),
        ).toBeNull();
    });

    it("GlobalSearchBox sends a campus to a canonical route, never a card or overlay", () => {
        // Re-pointed when Search moved onto Focus Panel targets. A campus has no
        // Focus Panel card, so its destination is resolved server-side as a
        // canonical route and the control simply follows the href it was given —
        // it builds no URL and opens no overlay.
        const box = read("app/adminV2/components/GlobalSearchBox.tsx");
        expect(box).toMatch(/target === "route"[\s\S]*router\.push\(destination\.href\)/);
        expect(box).not.toContain("launchGlobalRecordSearchOpen");
    });

    it("locations settings page restores selection from locationId query param", () => {
        const page = read("app/adminV2/settings/locations/page.tsx");
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        const configPage = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("parseLocationSettingsLocationId");
        expect(page).toContain("initialLocationId");
        expect(hook).toContain("initialLocationId");
        expect(hook).toContain("resolveLocationsSelection");
        expect(read("lib/locations/locationsSelectionAdapter.ts")).toContain(
            "Location not found or unavailable.",
        );
        expect(configPage).toContain("canonicalLocationSettingsHref");
    });
});
