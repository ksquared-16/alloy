import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    inquiryChildOcmPlacementLabelsIncomplete,
    opportunityDrawerRecordNeedsRevalidate,
    opportunityDrawerRestoreShouldHoldLoading,
} from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";

const webRoot = join(__dirname, "..", "..", "..");

describe("opportunityDrawerRecordNeedsRevalidate", () => {
    it("requires revalidate when record surface is not full", () => {
        expect(opportunityDrawerRecordNeedsRevalidate({ _record_surface: "drawer_primary" })).toBe(true);
    });

    it("requires revalidate when _inquiry_children key is missing on full surface", () => {
        expect(
            opportunityDrawerRecordNeedsRevalidate({
                _record_surface: "full",
            })
        ).toBe(true);
    });

    it("requires revalidate when inquiry child has program type but no label", () => {
        expect(
            opportunityDrawerRecordNeedsRevalidate({
                _record_surface: "full",
                _inquiry_children: [{ desired_program_type: "toddler", desired_program_label: null }],
            })
        ).toBe(true);
    });

    it("requires revalidate when schedule type lacks label", () => {
        expect(
            inquiryChildOcmPlacementLabelsIncomplete({
                desired_schedule_type: "full_day",
                desired_schedule_label: null,
            })
        ).toBe(true);
        expect(
            opportunityDrawerRecordNeedsRevalidate({
                _record_surface: "full",
                _inquiry_children: [
                    {
                        desired_program_type: "toddler",
                        desired_program_label: "Toddler",
                        desired_schedule_type: "full_day",
                        desired_schedule_label: null,
                    },
                ],
            })
        ).toBe(true);
    });

    it("does not require revalidate when full surface has resolved inquiry labels", () => {
        expect(
            opportunityDrawerRecordNeedsRevalidate({
                _record_surface: "full",
                _inquiry_children: [
                    {
                        desired_program_type: "toddler",
                        desired_program_label: "Toddler Program",
                        desired_schedule_type: "full_day",
                        desired_schedule_label: "Full day",
                        location_id: "loc-1",
                        location_label: "West Campus",
                    },
                ],
            })
        ).toBe(false);
    });

    it("restore hold matches revalidate", () => {
        const incomplete = { _record_surface: "drawer_primary" as const };
        expect(opportunityDrawerRestoreShouldHoldLoading(incomplete)).toBe(
            opportunityDrawerRecordNeedsRevalidate(incomplete)
        );
    });

    it("AdminEntityDrawer holds loading shell for incomplete opportunity restore", () => {
        const drawer = readFileSync(
            join(webRoot, "components/admin/AdminEntityDrawer.tsx"),
            "utf8"
        );
        expect(drawer).toContain("opportunityDrawerRecordNeedsRevalidate");
        expect(drawer).toContain("opportunityDrawerSnapshotIncomplete");
        expect(drawer).toContain("setLoading(needsRevalidate)");
        expect(drawer).toContain("runOpportunityBackgroundFullHydrateRef.current?.({ cacheBust: true })");
        expect(drawer).toContain('prev.type === "persons"');
        expect(drawer).toContain("applyPersonIdentityPatchToOpportunityHost");
    });

    it("goBack clears person drawer open seed when restoring opportunity", () => {
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("personDrawerOpenSeed: null");
    });
});
