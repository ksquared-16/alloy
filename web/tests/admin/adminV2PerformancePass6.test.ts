import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_OPTION_LABEL_MAP, optionLabelFromBatchMap } from "@/lib/admin/optionItemLabelForOrg";
import {
    applyOpportunityFullHydrateDeferredPatch,
    classifyOpportunityDrawerLayoutChanges,
    mergeOpportunityFullHydrateStaged,
    OPPORTUNITY_FULL_HYDRATE_DEFERRED_RECORD_KEYS,
} from "@/lib/admin/drawer/opportunityFullHydrateMerge";
import { reportOpportunityDrawerHydrateLayoutStability } from "@/lib/admin/drawer/opportunityDrawerAboveFoldGeometry";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 6 contracts", () => {
    it("inquiry options not required for first paint — empty label map uses item_key fallback", () => {
        expect(optionLabelFromBatchMap(EMPTY_OPTION_LABEL_MAP as Map<string, string>, "childcare_program_type", "preschool_3day")).toBe(
            "preschool_3day"
        );
        const entity = read("lib/admin/opportunityEntityRecord.ts");
        expect(entity).toContain("EMPTY_OPTION_LABEL_MAP");
        expect(entity).not.toMatch(/attachOpportunityInquiryChildrenShell[\s\S]{0,900}batchOptionItemLabelsForOrg/);
    });

    it("full hydrate cannot mutate above-fold geometry when layout locked", () => {
        const prev = {
            id: "o1",
            _customer_name: "Acme",
            _primary_person_name: "Jane Doe",
            _record_surface: "drawer_primary",
        };
        const full = {
            ...prev,
            _record_surface: "full",
            _inquiry_children: [{ id: "c1", display_name: "Child" }],
            _identity: { household: { label: "Acme" }, primary_child: { label: "Child" } },
        };
        const { merged, deferredPatch } = mergeOpportunityFullHydrateStaged(prev, full, {
            aboveFoldLocked: true,
        });
        expect(merged._inquiry_children).toBeUndefined();
        expect(deferredPatch?._inquiry_children).toHaveLength(1);
        expect(merged._record_surface).toBe("full");
        expect(merged._full_hydrate_deferred_pending).toBe(true);

        const applied = applyOpportunityFullHydrateDeferredPatch(merged, deferredPatch!);
        expect(applied._inquiry_children).toHaveLength(1);
        expect(applied._full_hydrate_deferred_pending).toBeUndefined();
    });

    it("record section actions reserve space before intersection fetch", () => {
        const actions = read("components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx");
        expect(actions).toMatch(/min-h-\[2\.25rem\]/);
    });

    it("composed coordinator passes queue preview seed to primary fetch", () => {
        const coordinator = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        const shell = read("components/admin/OpportunityDrawerOpenCoordinator.tsx");
        expect(coordinator).toContain("queuePreviewSeed");
        expect(coordinator).toMatch(/fetchOpportunityDrawerPrimaryEntity[\s\S]{0,120}queuePreviewSeed/);
        expect(shell).toContain("queuePreviewSeed: openingOpportunity.opportunityQueuePreviewSeed");
    });

    it("layout stability telemetry reports changed sections", () => {
        const report = reportOpportunityDrawerHydrateLayoutStability(
            "o1",
            "test_merge",
            { id: "o1", _customer_name: "Before" },
            { id: "o1", _customer_name: "After", _inquiry_children: [] },
            { aboveFoldLocked: true, fullHydrateApplied: true, sourceSurface: "full" }
        );
        expect(report.changed_sections).toContain("family_contacts");
        expect(OPPORTUNITY_FULL_HYDRATE_DEFERRED_RECORD_KEYS.has("_inquiry_children")).toBe(true);
        const classified = classifyOpportunityDrawerLayoutChanges(
            { id: "o1", _customer_name: "A" },
            { id: "o1", _customer_name: "B" },
            false
        );
        expect(classified.text_only_change).toBe(true);
        expect(classified.above_fold_changed).toBe(true);
    });

});
