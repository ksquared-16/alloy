import { describe, expect, it } from "vitest";

import { identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import { previewRowModelFromConfig } from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import {
    availableFieldsForNestedGroup,
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import { nextQueueRecordBlockId } from "@/lib/layout/queueRecordLayoutIds";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    collectionPresentationForFieldKey,
    renderCollectionFieldFromContext,
} from "@/lib/presentation/collectionFieldPresentation";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

ensureRuntimeSurfacesRegistered();

const liveCtx = {
    contract_version: "1.1-partial",
    row_subject: { subject_type: "case", subject_id: "c1", display_name: "Wenc" },
    row_stage: "new",
    lifecycle_key: "enrollment",
    row_status_key: "open",
    row_status_label: "Open",
    case_context: {
        case_id: "c1",
        display_name: "Wenc",
        case_type_label: "",
        case_status_key: "",
        case_status_label: "",
    },
    primary_contact: null,
    related_subjects_summary: [
        { subject_type: "child", subject_id: "1", display_name: "Blake Wenc", status_label: "—" },
        { subject_type: "child", subject_id: "2", display_name: "Jarek Wenc", status_label: "—" },
    ],
    row_presentation_mode: "single_subject",
    attention_summary: null,
    work_summary: null,
    current_work_summary: null,
    next_best_action: null,
    drawer_open: { entity_type: "opportunities", entity_id: "c1" },
} as unknown as QueueRowContext;

function layout(keys: string[]) {
    const base = emptyQueueRowLayoutV3();
    return {
        ...base,
        columns: [
            {
                id: "col",
                label: "Children",
                width: "small" as const,
                scope: { type: "main_record" } as const,
                builderSlot: "groupCount" as const,
                blocks: [
                    {
                        id: nextQueueRecordBlockId("fg"),
                        type: "field_group" as const,
                        fields: keys.map((fieldKey) => ({
                            id: nextQueueRecordBlockId("f"),
                            fieldKey,
                            label: fieldKey,
                                display: "text" as const,
                        })),
                    },
                ],
            },
        ],
    };
}

describe("children names vs count distinct providers", () => {
    it("keeps distinct presentation modes for names, count, and summary", () => {
        expect(collectionPresentationForFieldKey("children.names")?.displayMode).toBe("list");
        expect(collectionPresentationForFieldKey("children.count")?.displayMode).toBe("count");
        expect(collectionPresentationForFieldKey("children.summary")?.displayMode).toBe("summary");
    });

    it("resolves names and count separately from the same related_subjects payload", () => {
        expect(renderCollectionFieldFromContext("children.names", liveCtx)).toBe("Blake Wenc, Jarek Wenc");
        expect(renderCollectionFieldFromContext("children.count", liveCtx)).toBe("2 children");
        expect(renderCollectionFieldFromContext("children.summary", liveCtx)).toBe(
            "2 children · Blake Wenc, Jarek Wenc",
        );
    });

    it("honors configured order of names then count on the compact slot", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(layout(["children.names", "children.count"]));
        expect(mapped.slots.groupCount.fieldKeys).toEqual(["children.names", "children.count"]);
        expect(mapped.slots.groupCount.collectionPresentationByFieldKey?.["children.names"]?.displayMode).toBe(
            "list",
        );
        expect(mapped.slots.groupCount.collectionPresentationByFieldKey?.["children.count"]?.displayMode).toBe(
            "count",
        );
        expect(resolveCompactSlotDisplay("groupCount", liveCtx, mapped.slots.groupCount, null)).toBe(
            "Blake Wenc, Jarek Wenc · 2 children",
        );
    });

    it("seeds builder Live Preview with child names so CondensedQueueRow matches runtime", () => {
        const cfg = layout(["children.names"]);
        const preview = previewRowModelFromConfig(cfg);
        const mapped = mapQueueRowSurfaceToCompactConfig(cfg);
        expect(preview.context?.related_subjects_summary.map((s) => s.display_name)).toEqual([
            "Blake Wenc",
            "Jarek Wenc",
        ]);
        expect(resolveCompactSlotDisplay("groupCount", preview.context!, mapped.slots.groupCount, null)).toBe(
            "Blake Wenc, Jarek Wenc",
        );
    });

    it("shows count-only preview when only children.count is configured", () => {
        const cfg = layout(["children.count"]);
        const preview = previewRowModelFromConfig(cfg);
        const mapped = mapQueueRowSurfaceToCompactConfig(cfg);
        expect(resolveCompactSlotDisplay("groupCount", preview.context!, mapped.slots.groupCount, null)).toBe(
            "2 children",
        );
    });
});

describe("Children identity card inquiry participation catalog", () => {
    it("offers inquiry participation fields on the identity group Add Field picker", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "identity", cfg);
        const keys = available.map((f) => f.key);
        const byKey = Object.fromEntries(available.map((f) => [f.key, f.label]));

        expect(keys).toContain("inquiry_child.location_id");
        expect(keys).toContain("inquiry_child.program");
        expect(keys).toContain("inquiry_child.program_room_cohort_key");
        expect(keys).toContain("inquiry_child.schedule_type");
        expect(keys).toContain("inquiry_child.start_date");
        expect(keys).toContain("child.date_of_birth");

        expect(byKey["inquiry_child.program"]).toBe("Program");
        expect(byKey["inquiry_child.schedule_type"]).toBe("Schedule");
        expect(byKey["inquiry_child.program_room_cohort_key"]).toBe("Room");
        expect(byKey["inquiry_child.start_date"]).toBe("Start date");
        expect(byKey["inquiry_child.location_id"]).toBe("Location");

        // No misleading "Current *" aliases for inquiry participation.
        expect(Object.values(byKey).some((label) => label.startsWith("Current "))).toBe(false);
    });

    it("derives identity picker from the same catalog as nested group availability", () => {
        const picker = identityPickerFieldsForNamespaces({
            namespaces: ["child", "inquiry_child"],
        });
        expect(picker.map((f) => f.key)).toEqual(
            expect.arrayContaining([
                "inquiry_child.schedule_type",
                "inquiry_child.program",
                "child.date_of_birth",
            ]),
        );
    });
});
