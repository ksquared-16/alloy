import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    resolveEnrollmentMirrorSiteLocationId,
} from "@/lib/admin/person/buildPersonEnrollmentMirrorRows";
import { resolvePersonDrawerChildPlacementFromRecord } from "@/lib/admin/person/personDrawerChildPlacementContext";
import { resolveChildHouseholdCardLines } from "@/lib/admin/person/personDrawerLocationCategoryOwnership";

describe("buildPersonEnrollmentMirrorRows", () => {
    it("prefers OCM location_id over opportunity.location_id", () => {
        expect(resolveEnrollmentMirrorSiteLocationId("ocm-loc", "opp-loc")).toBe("ocm-loc");
    });

    it("falls back to opportunity.location_id when OCM location is empty", () => {
        expect(resolveEnrollmentMirrorSiteLocationId(null, "opp-loc")).toBe("opp-loc");
        expect(resolveEnrollmentMirrorSiteLocationId("", "opp-loc")).toBe("opp-loc");
    });

    it("mirror builder selects opportunity.location_id for site resolution", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/person/buildPersonEnrollmentMirrorRows.ts"),
            "utf8"
        );
        expect(src).toContain('select("id, name, status_key, location_id")');
        expect(src).toContain("resolveEnrollmentMirrorSiteLocationId");
    });
});

describe("child placement display from enrollment mirror", () => {
    const mirrorWithOppFallback = [
        {
            id: "ocm-1",
            opportunity_id: "opp-1",
            opportunity_name: "Family inquiry",
            opportunity_status_label: "Family inquiry",
            customer_member_id: "m-mia",
            program_label: "Preschool",
            location_id: "loc-north",
            location_label: "North Campus",
            room_label: null,
        },
    ];

    it("child header resolver shows program and site location pills", () => {
        const placement = resolvePersonDrawerChildPlacementFromRecord({
            _enrollment_mirror: mirrorWithOppFallback,
            _enrollment_opportunities: [],
        });
        expect(placement.program_label).toBe("Preschool");
        expect(placement.location_label).toBe("North Campus");

        const header = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(header).toContain("data-person-drawer-child-header-program");
        expect(header).toContain("data-person-drawer-child-header-location");
        expect(header).not.toContain("PersonDrawerChildPlacementPanel");
    });

    it("household child row includes age, program, and site on one line", () => {
        const lines = resolveChildHouseholdCardLines({
            age_label: "3 yrs",
            program_label: "Preschool",
            location_label: "North Campus",
        });
        expect(lines.placement_line).toBe("3 yrs · Preschool · North Campus");
        expect(lines.age_line).toBeNull();
    });

    it("edit placement affordance lives on header executive", () => {
        const header = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(header).toContain("data-person-drawer-edit-placement-on-lead");
        expect(header).toContain("PERSON_DRAWER_EDIT_PLACEMENT_ON_LEAD_LABEL");
        expect(header).toContain("onOpenLeadOpportunity");
    });
});
