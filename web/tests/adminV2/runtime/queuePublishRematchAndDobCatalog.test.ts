import { describe, expect, it } from "vitest";

import { identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import {
    availableFieldsForNestedGroup,
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { computedFieldByRefKey } from "@/lib/fields/computedFieldCatalog";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { resolveQueueRowCompactSlots } from "@/lib/presentation/runtime/queueRowVariantResolve";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { nextQueueRecordBlockId } from "@/lib/layout/queueRecordLayoutIds";

ensureRuntimeSurfacesRegistered();

function layoutWithDefaultAndStageVariant(args: {
    defaultKeys: string[];
    variantStatusLabel: string;
}): QueueRecordLayoutConfigV3 {
    const base = emptyQueueRowLayoutV3();
    return {
        ...base,
        columns: [
            {
                id: "col-default",
                label: "Primary",
                width: "small",
                scope: { type: "main_record" } as const,
                blocks: [
                    {
                        id: nextQueueRecordBlockId("fg"),
                        type: "field_group",
                        title: null,
                        fields: args.defaultKeys.map((fieldKey) => ({
                            id: nextQueueRecordBlockId("f"),
                            fieldKey,
                            label: fieldKey,
                        })),
                    },
                ],
            },
        ],
        variants: [
            {
                id: "stage-new",
                label: "New lead",
                priority: 10,
                appliesWhen: { stage_key: ["new_lead"] },
                columns: [
                    {
                        id: "col-status",
                        label: "",
                        width: "small",
                        scope: { type: "main_record" } as const,
                        builderSlot: "status",
                        blocks: [
                            {
                                id: nextQueueRecordBlockId("fg"),
                                type: "field_group",
                                title: null,
                                fields: [
                                    {
                                        id: nextQueueRecordBlockId("f"),
                                        fieldKey: "opportunity.status_label",
                                        label: args.variantStatusLabel,
                                        display: "text",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("P0 published queue rematch + P1 DOB catalog", () => {
    it("rematches stage variant rows against freshly published Default (children.names + no email)", () => {
        const published = layoutWithDefaultAndStageVariant({
            defaultKeys: ["children.names", "person.phone"],
            variantStatusLabel: "New",
        });
        const slots = resolveQueueRowCompactSlots(published, { stageKey: "new_lead" });
        expect(slots.groupCount.fieldKeys).toContain("children.names");
        expect(slots.contact.fieldKeys ?? []).not.toContain("person.email");
        expect(slots.contact.fieldKeys ?? []).not.toContain("person.primary_email");
        expect(slots.status.label).toBe("New");
    });

    it("exposes child.date_of_birth in focus_panel assembly and Children identity picker", () => {
        const providers = assembleFocusPanelNestedProviders();
        expect(providers.some((p) => p.refKey === "child.date_of_birth")).toBe(true);

        const picker = identityPickerFieldsForNamespaces({ namespaces: ["child"] });
        expect(picker.map((f) => f.key)).toContain("child.date_of_birth");

        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "identity", cfg);
        expect(available.map((f) => f.key)).toContain("child.date_of_birth");
    });

    it("keeps Date of birth as its own picker identity (not collapsed into Age)", () => {
        const picker = identityPickerFieldsForNamespaces({ namespaces: ["child"] });
        const keys = picker.map((f) => f.key);
        expect(keys).toContain("child.date_of_birth");
        expect(keys.filter((k) => k === "child.date_of_birth")).toHaveLength(1);
    });

    it("registers children aggregate composites in the computed catalog", () => {
        expect(computedFieldByRefKey("children.names")?.label).toBe("Children names");
        expect(computedFieldByRefKey("children.count")?.label).toBe("Children count");
        expect(computedFieldByRefKey("children.summary")?.label).toBe("Children summary");
    });
});
