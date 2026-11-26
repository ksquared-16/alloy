import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filterPersonDrawerHouseholdVisibilityBySiteScope } from "@/lib/admin/person/personDrawerHouseholdSiteScope";
import {
    formatChildEnrollmentContextLine,
    resolveSharedHouseholdPlacementContext,
} from "@/lib/admin/person/personDrawerLocationCategoryOwnership";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

describe("personDrawerLocationCategoryOwnership", () => {
    it("child drawer displays location and program from enrollment mirror", () => {
        const summary = resolvePersonDrawerChildSummaryModel({
            first_name: "Ava",
            last_name: "Lee",
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Lee lead",
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "member-1",
                    child_display_name: "Ava Lee",
                    location_id: "loc-1",
                    location_label: "North Campus",
                    program_label: "Toddler",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        });
        expect(summary.program_label).toBe("Toddler");
        expect(summary.location_label).toBe("North Campus");

        const header = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(header).toContain("data-person-drawer-child-header-program");
        expect(header).toContain("resolvePersonDrawerChildPlacementFromRecord");
        expect(header).not.toContain("record.location_id");
    });

    it("parent household child rows show per-child program and location", () => {
        const model = resolvePersonDrawerHouseholdModel({
            _household_context: [{ customer_id: "cust-1", customer_name: "Family" }],
            _household_child_links: [
                {
                    customer_member_id: "m-1",
                    customer_id: "cust-1",
                    person_id: "child-1",
                    display_name: "Ava",
                },
                {
                    customer_member_id: "m-2",
                    customer_id: "cust-1",
                    person_id: "child-2",
                    display_name: "Ben",
                },
            ],
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-1",
                    child_display_name: "Ava",
                    location_id: "loc-a",
                    location_label: "Campus A",
                    program_label: "Preschool",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
                {
                    id: "ocm-2",
                    opportunity_id: "opp-2",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-2",
                    child_display_name: "Ben",
                    location_id: "loc-b",
                    location_label: "Campus B",
                    program_label: "Infant",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        });

        const children = model.groups[0]?.children ?? [];
        expect(children[0]?.program_label).toBe("Preschool");
        expect(children[0]?.location_label).toBe("Campus A");
        expect(children[1]?.program_label).toBe("Infant");
        expect(children[1]?.location_label).toBe("Campus B");
        expect(formatChildEnrollmentContextLine(children[0]!)).toBe("Preschool · Campus A");
    });

    it("multi-location parent does not get a single shared household placement", () => {
        const children = resolvePersonDrawerHouseholdModel({
            _household_context: [{ customer_id: "cust-1", customer_name: "Family" }],
            _household_child_links: [
                {
                    customer_member_id: "m-1",
                    customer_id: "cust-1",
                    person_id: "c1",
                    display_name: "A",
                },
                {
                    customer_member_id: "m-2",
                    customer_id: "cust-1",
                    person_id: "c2",
                    display_name: "B",
                },
            ],
            _enrollment_mirror: [
                {
                    id: "1",
                    opportunity_id: "o1",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-1",
                    child_display_name: "A",
                    location_id: "loc-a",
                    location_label: "Site A",
                    program_label: "Pre-K",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
                {
                    id: "2",
                    opportunity_id: "o2",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-2",
                    child_display_name: "B",
                    location_id: "loc-b",
                    location_label: "Site B",
                    program_label: "Pre-K",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        }).groups[0]?.children ?? [];

        expect(resolveSharedHouseholdPlacementContext(children)).toBeNull();
    });

    it("location-scoped access hides children at inaccessible sites", () => {
        const out: Record<string, unknown> = {
            _household_context: [{ customer_id: "cust-1", customer_name: "Family" }],
            _household_child_links: [
                {
                    customer_member_id: "m-a",
                    customer_id: "cust-1",
                    person_id: "child-a",
                    display_name: "At Site A",
                },
                {
                    customer_member_id: "m-b",
                    customer_id: "cust-1",
                    person_id: "child-b",
                    display_name: "At Site B",
                },
            ],
            _household_adult_links: [],
            _enrollment_mirror: [
                {
                    id: "1",
                    opportunity_id: "o1",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-a",
                    child_display_name: "At Site A",
                    location_id: "site-a",
                    location_label: "Site A",
                    program_label: "Pre-K",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
                {
                    id: "2",
                    opportunity_id: "o2",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-b",
                    child_display_name: "At Site B",
                    location_id: "site-b",
                    location_label: "Site B",
                    program_label: "Pre-K",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        };

        filterPersonDrawerHouseholdVisibilityBySiteScope(out, {
            departmentScope: "all",
            allowedDepartmentIds: [],
            siteScope: "restricted",
            allowedSiteLocationIds: ["site-a"],
        });

        const childLinks = out._household_child_links as { display_name: string }[];
        expect(childLinks).toHaveLength(1);
        expect(childLinks[0]?.display_name).toBe("At Site A");

        const model = resolvePersonDrawerHouseholdModel(out);
        expect(model.groups[0]?.children).toHaveLength(1);
        expect(model.groups[0]?.children[0]?.location_label).toBe("Site A");
    });
});
