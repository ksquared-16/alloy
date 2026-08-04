/**
 * P0 — live queue must resolve the Surface Builder published layout, not a legacy
 * work-view-scoped entity_layouts sibling or pipeline_queue_row fallback.
 */
import { describe, expect, it } from "vitest";

import {
    resolveQueueRowSurfaceSpec,
} from "@/lib/layout/runtime/queueRowLayoutServer";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { resolveQueueRowCompactSlots } from "@/lib/presentation/runtime/queueRowVariantResolve";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { identityPickerCategoriesForNamespaces, IDENTITY_PICKER_SHOW_ALL_KEY } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import { assembleSurfaceComposerFieldCatalog } from "@/lib/adminV2/settings/surfaces/surfaceComposerFieldCatalog";
import { resetCanonicalDataProviderCacheForTests } from "@/lib/fields/canonicalDataProviderRegistry";

function layoutWithKeys(keys: string[]): QueueRecordLayoutConfigV3 {
    return {
        variant: "operational-row",
        version: 3,
        columns: [
            {
                id: "col-1",
                label: "Primary",
                width: "large",
                scope: { type: "main_record" },
                builderSlot: "identity",
                blocks: [
                    {
                        type: "field_group",
                        id: "fg-1",
                        label: "Fields",
                        layout: "stack",
                        fields: keys.map((fieldKey) => ({ id: fieldKey, fieldKey, label: fieldKey, display: "text" as const })),
                    },
                ],
            },
            {
                id: "col-2",
                label: "Secondary",
                width: "small",
                scope: { type: "main_record" },
                builderSlot: "groupCount",
                blocks: [
                    {
                        type: "field_group",
                        id: "fg-2",
                        label: "Children",
                        layout: "stack",
                        fields: [
                            { id: "children.names", fieldKey: "children.names", label: "Children names", display: "text" },
                            { id: "children.count", fieldKey: "children.count", label: "Children count", display: "text" },
                        ],
                    },
                ],
            },
        ],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        variants: [
            {
                id: "stale-tour",
                label: "Tour",
                priority: 10,
                appliesWhen: { stage_key: ["new_lead"] },
                columns: [
                    {
                        id: "vcol",
                        label: "Status only",
                        width: "medium",
                        scope: { type: "main_record" },
                        builderSlot: "status",
                        blocks: [
                            {
                                type: "field_group",
                                id: "vfg",
                                label: "Status",
                                layout: "stack",
                                fields: [{ id: "queue_row.stage_label", fieldKey: "queue_row.stage_label", label: "Stage", display: "text" }],
                            },
                        ],
                    },
                ],
                fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
            },
        ],
    };
}

describe("live queue surface authority", () => {
    it("resolves pipeline-queue-row + processKey to queue_row_${processKey}", () => {
        const spec = resolveQueueRowSurfaceSpec("pipeline-queue-row", "enrollment");
        expect(spec?.layoutKey).toBe("queue_row_enrollment");
    });

    it("keeps legacy pipeline layout key when no processKey hint", () => {
        const spec = resolveQueueRowSurfaceSpec("pipeline-queue-row", null);
        expect(spec?.layoutKey).toBe("pipeline_queue_row");
    });

    it("published Default column keys reach CondensedQueueRow compact slots", () => {
        const published = layoutWithKeys([
            "customer.display_name",
            "person.primary_contact_name",
            "person.phone",
            "queue_row.stage_label",
        ]);
        const slots = resolveQueueRowCompactSlots(published, { stageKey: "unknown" });
        expect(slots.groupCount.fieldKeys).toEqual(
            expect.arrayContaining(["children.names", "children.count"]),
        );
        expect(slots.contact.fieldKeys).toEqual(
            expect.arrayContaining(["person.primary_contact_name", "person.phone"]),
        );
    });

    it("valid published Default defeats empty stage-variant columns via inherit", () => {
        const published = layoutWithKeys(["customer.display_name", "person.phone"]);
        const slots = resolveQueueRowCompactSlots(published, { stageKey: "new_lead" });
        // Variant specializes status only → children inherit from Default.
        expect(slots.groupCount.fieldKeys).toEqual(
            expect.arrayContaining(["children.names", "children.count"]),
        );
    });

    it("mapQueueRowSurfaceToCompactConfig(null) is the only generic fallback", () => {
        const generic = mapQueueRowSurfaceToCompactConfig(null);
        expect(generic.fallbackSlots.length).toBeGreaterThan(0);
        const published = mapQueueRowSurfaceToCompactConfig(layoutWithKeys(["person.phone"]));
        expect(published.fallbackSlots).toEqual([]);
        expect(published.slots.contact.fieldKeys).toContain("person.phone");
    });
});

describe("surface composer field categories", () => {
    it("exposes Inquiry Participation from configured section keys (not enrollment alias)", () => {
        resetCanonicalDataProviderCacheForTests();
        const categories = assembleSurfaceComposerFieldCatalog({
            namespaces: ["child", "inquiry_child"],
            includeShowAll: true,
        });
        expect(categories.some((c) => c.key === IDENTITY_PICKER_SHOW_ALL_KEY)).toBe(true);
        const inquiry = categories.find((c) => c.key === "inquiry_participation");
        expect(inquiry?.label).toMatch(/Inquiry Participation/i);
        const keys = inquiry?.fields.map((f) => f.key) ?? [];
        expect(keys).toEqual(
            expect.arrayContaining([
                "inquiry_child.location_id",
                "inquiry_child.program_room_cohort_key",
                "inquiry_child.schedule_type",
                "inquiry_child.start_date",
            ]),
        );
    });

    it("category selection returns only that category's fields", () => {
        resetCanonicalDataProviderCacheForTests();
        const categories = identityPickerCategoriesForNamespaces({
            namespaces: ["child", "inquiry_child"],
            includeShowAll: false,
        });
        const profile = categories.find((c) => c.key === "child_profile");
        expect(profile).toBeTruthy();
        expect(profile!.fields.every((f) => f.categoryKey === "child_profile")).toBe(true);
        expect(profile!.fields.some((f) => f.key === "child.date_of_birth")).toBe(true);
    });

    it("Show all preserves category grouping order", () => {
        resetCanonicalDataProviderCacheForTests();
        const withAll = assembleSurfaceComposerFieldCatalog({
            namespaces: ["child", "inquiry_child"],
            includeShowAll: true,
        });
        expect(withAll[0]?.key).toBe(IDENTITY_PICKER_SHOW_ALL_KEY);
        const without = withAll.filter((c) => c.key !== IDENTITY_PICKER_SHOW_ALL_KEY);
        expect(without.length).toBeGreaterThan(1);
        // Show-all fields are concatenation in category order.
        expect(withAll[0]?.fields.map((f) => f.key)).toEqual(without.flatMap((c) => c.fields.map((f) => f.key)));
    });
});
