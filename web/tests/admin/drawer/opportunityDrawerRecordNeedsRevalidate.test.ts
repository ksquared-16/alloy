import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    inquiryChildOcmPlacementLabelsIncomplete,
    opportunityDrawerRecordNeedsRevalidate,
    opportunityDrawerRestoreShouldHoldLoading,
    snapshotCanRenderDrawerFrame,
    snapshotCanRenderHeaderActions,
    snapshotCanRenderOverviewBody,
    snapshotInquiryChildrenNeedHydrate,
    snapshotNeedsFullRevalidate,
} from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";

const webRoot = join(__dirname, "..", "..", "..");

describe("opportunityDrawerRecordNeedsRevalidate", () => {
    it("typed drawer_primary snapshot can render frame and header without full hydrate", () => {
        const primary = { _record_surface: "drawer_primary", id: "opp-1" };
        expect(snapshotCanRenderDrawerFrame(primary)).toBe(true);
        expect(snapshotCanRenderHeaderActions(primary)).toBe(true);
        expect(snapshotCanRenderOverviewBody(primary)).toBe(true);
        expect(opportunityDrawerRestoreShouldHoldLoading(primary)).toBe(false);
        expect(snapshotNeedsFullRevalidate(primary)).toBe(true);
        expect(opportunityDrawerRecordNeedsRevalidate(primary)).toBe(true);
    });

    it("snapshotNeedsFullRevalidate when _inquiry_children key is missing on full surface", () => {
        const full = { _record_surface: "full" };
        expect(snapshotNeedsFullRevalidate(full)).toBe(true);
        expect(snapshotInquiryChildrenNeedHydrate(full)).toBe(true);
        expect(snapshotCanRenderDrawerFrame(full)).toBe(true);
        expect(opportunityDrawerRestoreShouldHoldLoading(full)).toBe(false);
    });

    it("snapshotInquiryChildrenNeedHydrate when inquiry child has program set but no label", () => {
        expect(
            inquiryChildOcmPlacementLabelsIncomplete({
                program_category_id: "cat-1",
                desired_program_label: null,
            })
        ).toBe(true);
        expect(
            inquiryChildOcmPlacementLabelsIncomplete({
                program_key: "toddler",
                desired_program_label: null,
            })
        ).toBe(true);
        const record = {
            _record_surface: "full",
            _inquiry_children: [{ program_category_id: "cat-1", desired_program_label: null }],
        };
        expect(snapshotInquiryChildrenNeedHydrate(record)).toBe(true);
        expect(snapshotNeedsFullRevalidate(record)).toBe(true);
        expect(snapshotCanRenderDrawerFrame(record)).toBe(true);
    });

    it("does not need full revalidate when full surface has resolved inquiry labels", () => {
        expect(
            snapshotNeedsFullRevalidate({
                _record_surface: "full",
                _inquiry_children: [
                    {
                        program_category_id: "cat-1",
                        desired_program_label: "Toddler Program",
                        schedule_type: "full_day",
                        desired_schedule_label: "Full day",
                        location_id: "loc-1",
                        location_label: "West Campus",
                    },
                ],
            })
        ).toBe(false);
    });

    it("goBack clears person drawer open seed when restoring opportunity", () => {
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("personDrawerOpenSeed: null");
    });
});
