/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import type { QueueRecordLayoutConfigV3, QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import {
    buildCatalog,
    buildConfigFromState,
    stateFromConfig,
} from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import {
    buildQueueRowLibraryCatalog,
    libraryItemsByCategory,
    prioritizeLibraryForRowFocus,
    type QueueRowLibraryFieldItem,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import { listPlacedFields } from "@/lib/adminV2/settings/surfaces/queueRowComposerModel";
import { createQueueRowVariant } from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import { resolveQueueRowCompactSlots } from "@/lib/presentation/runtime/queueRowVariantResolve";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { DEFAULT_CHILDREN_COLLECTION_PRESENTATION } from "@/lib/presentation/collectionFieldPresentation";
import {
    resolveQueueRowCatalogIsWaitlist,
    resolveQueueRowIncludeWaitlistLibraryFields,
} from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

const TOUR_ONLY_STAGES = [{ value: "tour_scheduled", label: "Tour Scheduled" }];
const ENROLLMENT_STAGES = [
    { value: "new_lead", label: "New Leads" },
    { value: "waitlist", label: "Waitlist" },
];

type RowZones = ReturnType<typeof stateFromConfig>;

function libraryChildrenField(
    catalogIsWaitlist: boolean,
    includeWaitlistFields: boolean,
): QueueRowLibraryFieldItem | undefined {
    const items = buildQueueRowLibraryCatalog({
        isWaitlist: catalogIsWaitlist,
        includeWaitlistFields,
        inRowZoneKeys: ["children", "household", "status"],
    });
    const childCategory = libraryItemsByCategory(items).find((c) => c.key === "child");
    return childCategory?.items.find(
        (item): item is QueueRowLibraryFieldItem =>
            item.kind === "field" && item.fieldKey === "children",
    );
}

function enableChildrenCollection(
    zones: RowZones,
    presentation = {
        ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
        includedFields: ["first_name", "age"] as const,
    },
): RowZones {
    return zones.map((z) => {
        if (z.key !== "children") return z;
        return {
            ...z,
            inRow: true,
            canvasSlot: "groupCount" as const,
            fieldOrder: ["children"],
            fieldPlacements: {
                children: {
                    builderSlot: "groupCount",
                    stackLine: 0,
                    inlineWithPrevious: false,
                    collectionPresentation: presentation,
                },
            },
            evidenceGroups: z.evidenceGroups.map((g) => ({
                ...g,
                enabled:
                    g.fields.some((f) => f.fieldKey === "children") ||
                    g.blockId.includes("summary") ||
                    g.blockId.includes("candidate"),
                fields: g.fields.map((f) =>
                    f.fieldKey === "children" ? { ...f, enabled: true, label: "Children" } : f,
                ),
            })),
        };
    });
}

function familyContext(): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Jordan Lee" },
        row_stage: "Tour Scheduled",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Open",
        },
        primary_contact: { display_name: "Casey Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Lennon Kurzman",
                status_label: "Lead",
                age_label: "2y",
            },
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Wrigley Kurzman",
                status_label: "Lead",
                age_label: "3m",
            },
        ],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
    };
}

describe("queue row variant / default Children collection parity", () => {
    it("Default and waitlist-stage variant share the same catalog grain on tour-only processes", () => {
        const waitlistVariant: QueueRowVariant = createQueueRowVariant({
            label: "Waitlist",
            priority: 10,
            appliesWhen: { stage_key: ["waitlist"] },
            subjectFocus: "placement_candidate_child",
        });

        const defaultCatalogIsWaitlist = resolveQueueRowCatalogIsWaitlist({ processStages: TOUR_ONLY_STAGES });
        const variantCatalogIsWaitlist = resolveQueueRowCatalogIsWaitlist({ processStages: TOUR_ONLY_STAGES });
        const variantIncludeWaitlist = resolveQueueRowIncludeWaitlistLibraryFields({
            activeVariant: waitlistVariant,
            processStages: TOUR_ONLY_STAGES,
        });

        expect(defaultCatalogIsWaitlist).toBe(false);
        expect(variantCatalogIsWaitlist).toBe(false);
        expect(variantIncludeWaitlist).toBe(true);
    });

    it("Default and variant library catalogs include the same resolver-backed Children item", () => {
        const waitlistVariant = createQueueRowVariant({
            label: "Waitlist",
            priority: 10,
            appliesWhen: { stage_key: ["waitlist"] },
        });

        const defaultCatalogIsWaitlist = resolveQueueRowCatalogIsWaitlist({ processStages: TOUR_ONLY_STAGES });
        const defaultInclude = resolveQueueRowIncludeWaitlistLibraryFields({
            processStages: TOUR_ONLY_STAGES,
        });
        const variantInclude = resolveQueueRowIncludeWaitlistLibraryFields({
            activeVariant: waitlistVariant,
            processStages: TOUR_ONLY_STAGES,
        });

        const defaultChildren = libraryChildrenField(defaultCatalogIsWaitlist, defaultInclude);
        const variantChildren = libraryChildrenField(defaultCatalogIsWaitlist, variantInclude);

        expect(defaultChildren?.fieldKey).toBe("children");
        expect(variantChildren?.fieldKey).toBe("children");
    });

    it("Default can add Children collection and persist collectionPresentation", () => {
        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        const zones = enableChildrenCollection(stateFromConfig(base, catalog, false));
        const config = buildConfigFromState(base, zones, catalog);

        const childrenField = config.columns
            .flatMap((c) => c.blocks)
            .flatMap((b) => (b.type === "field_group" || b.type === "repeated_record_block" ? b.fields : []))
            .find((f) => f.fieldKey === "children");

        expect(childrenField).toBeDefined();
        expect(childrenField?.collectionPresentation?.includedFields).toEqual(["first_name", "age"]);
    });

    it("Variant can add Children collection and persist collectionPresentation on variant columns", () => {
        const catalogIsWaitlist = resolveQueueRowCatalogIsWaitlist({ processStages: ENROLLMENT_STAGES });
        const catalog = buildCatalog(catalogIsWaitlist);
        const base = emptyQueueRowLayoutV3();
        const variant = createQueueRowVariant({ label: "Tour", priority: 10, appliesWhen: { stage_key: ["tour_scheduled"] } });

        const zones = enableChildrenCollection(stateFromConfig(base, catalog, catalogIsWaitlist));
        const variantLayout = buildConfigFromState(base, zones, catalog);
        variant.columns = variantLayout.columns;

        const layout: QueueRecordLayoutConfigV3 = {
            ...base,
            variants: [variant],
        };

        const savedVariant = layout.variants?.[0];
        const childrenField = savedVariant?.columns
            .flatMap((c) => c.blocks)
            .flatMap((b) => (b.type === "field_group" || b.type === "repeated_record_block" ? b.fields : []))
            .find((f) => f.fieldKey === "children");

        expect(childrenField).toBeDefined();
        expect(childrenField?.collectionPresentation?.includedFields).toEqual(["first_name", "age"]);
    });

    it("row focus prioritizes child category but does not remove Children from library", () => {
        const items = buildQueueRowLibraryCatalog({
            isWaitlist: false,
            includeWaitlistFields: true,
            inRowZoneKeys: ["children", "household"],
        });
        const childFocusCategories = prioritizeLibraryForRowFocus(libraryItemsByCategory(items), "child");
        const familyFocusCategories = prioritizeLibraryForRowFocus(libraryItemsByCategory(items), "family");

        for (const categories of [childFocusCategories, familyFocusCategories]) {
            const childCategory = categories.find((c) => c.key === "child");
            const fieldKeys =
                childCategory?.items
                    .filter((item) => item.kind === "field")
                    .map((item) => item.fieldKey) ?? [];
            expect(fieldKeys).toContain("children");
        }

        expect(childFocusCategories[0]?.key).toBe("child");
        expect(familyFocusCategories[0]?.key).toBe("family_parents");
    });

    it("variant runtime renders Children names/age using the same resolver path as Default", () => {
        const presentation = {
            displayMode: "list" as const,
            includedFields: ["first_name", "age"] as const,
            listFormat: "comma" as const,
            maxDisplayed: "all" as const,
            overflowBehavior: "plus_n_more" as const,
        };

        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        const zones = enableChildrenCollection(stateFromConfig(base, catalog, false));
        const defaultLayout = buildConfigFromState(base, zones, catalog);

        const variant = createQueueRowVariant({
            label: "Tour",
            priority: 10,
            appliesWhen: { stage_key: ["tour_scheduled"] },
            columns: defaultLayout.columns,
        });

        const layout: QueueRecordLayoutConfigV3 = {
            ...base,
            columns: [],
            variants: [variant],
        };

        const ctx = familyContext();
        const defaultSlots = resolveQueueRowCompactSlots(layout, { stageKey: "unknown" });
        const variantSlots = resolveQueueRowCompactSlots(layout, { stageKey: "tour_scheduled" });

        const defaultDisplay = resolveCompactSlotDisplay("groupCount", ctx, defaultSlots.groupCount, null);
        const variantDisplay = resolveCompactSlotDisplay("groupCount", ctx, variantSlots.groupCount, null);

        expect(defaultDisplay).toBeNull();
        expect(variantDisplay).toBe("Lennon (2y), Wrigley (3m)");
        expect(variantSlots.groupCount.collectionPresentationByFieldKey?.children).toEqual(presentation);
    });

    it("composer round-trip preserves collectionPresentation for variant state", () => {
        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        let zones = enableChildrenCollection(stateFromConfig(base, catalog, false));
        const config = buildConfigFromState(base, zones, catalog);
        zones = stateFromConfig(config, catalog, false);

        const placed = listPlacedFields(zones).find((f) => f.fieldKey === "children");
        expect(placed?.collectionPresentation?.includedFields).toEqual(["first_name", "age"]);
    });
});
