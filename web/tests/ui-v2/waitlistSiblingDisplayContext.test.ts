import { describe, expect, it } from "vitest";
import { buildWaitlistSiblingContextLines } from "@/lib/ui-v2/waitlistSiblingDisplayContext";

describe("waitlistSiblingDisplayContext", () => {
    it("formats waitlisted sibling with name and program", () => {
        const out = buildWaitlistSiblingContextLines({
            siblingContext: {
                sibling_cohorts: [
                    {
                        placement_candidate_id: "pc-2",
                        child_display_name: "Riley Williams",
                        program_room_group_label: "Toddler",
                        program_room_cohort_key: "toddler",
                    },
                ],
            },
            bucketKey: "tier_general_waitlist",
            waitlistedSiblings: [{ childDisplayName: "Riley Williams", cohortLabel: "Toddler" }],
        });
        expect(out.lines).toEqual(["Sibling also waitlisted: Riley Williams — Toddler"]);
    });

    it("shows compact count for multiple waitlisted siblings", () => {
        const out = buildWaitlistSiblingContextLines({
            siblingContext: { sibling_cohorts: [] },
            bucketKey: "tier_general_waitlist",
            waitlistedSiblings: [
                { childDisplayName: "Riley Williams", cohortLabel: "Toddler" },
                { childDisplayName: "Quinn Williams", cohortLabel: "Infant" },
            ],
        });
        expect(out.lines[0]).toBe("Sibling also waitlisted: Riley Williams — Toddler (+1 more)");
    });

    it("formats enrolled sibling with name and program", () => {
        const out = buildWaitlistSiblingContextLines({
            siblingContext: {
                sibling_cohorts: [],
                enrolled_siblings: [
                    {
                        child_display_name: "Jordan Patel",
                        cohort_label: "Preschool",
                        location_id: "site-a",
                        location_label: null,
                        same_site_as_candidate: true,
                    },
                ],
            },
            bucketKey: "tier_sibling_enrolled",
        });
        expect(out.lines).toEqual(["Sibling enrolled: Jordan Patel — Preschool"]);
    });

    it("falls back without fake names when enrolled detail missing", () => {
        const out = buildWaitlistSiblingContextLines({
            siblingContext: {
                sibling_cohorts: [],
                enrolled_siblings: [],
                display_diagnostics: "enrolled_sibling_names_missing_in_household_load",
            },
            bucketKey: "tier_sibling_enrolled",
        });
        expect(out.lines).toEqual(["Sibling enrolled at this location"]);
        expect(out.diagnostics).toContain("enrolled_sibling_detail_missing");
    });

    it("formats sister-site sibling with location when available", () => {
        const out = buildWaitlistSiblingContextLines({
            siblingContext: {
                sibling_cohorts: [],
                enrolled_siblings: [
                    {
                        child_display_name: "Avery Nguyen",
                        cohort_label: "Pre-K",
                        location_id: "site-b",
                        location_label: "South Campus",
                        same_site_as_candidate: false,
                    },
                ],
            },
            bucketKey: "tier_sister_center",
        });
        expect(out.lines).toEqual(["Sibling at another location: Avery Nguyen — Pre-K — South Campus"]);
    });
});
