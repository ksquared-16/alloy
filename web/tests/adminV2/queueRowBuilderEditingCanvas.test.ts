/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import {
    buildQueueRowLibraryCatalog,
    libraryItemsByCategory,
    prioritizeLibraryForRowFocus,
    queueRowZoneLabel,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import {
    CANVAS_PLACEMENT_REGIONS,
    canvasAffordanceLabel,
    regionForZoneState,
} from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import { blankPreviewRowModel } from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import {
    processHasWaitlistStages,
    resolveQueueRowLibraryIsWaitlist,
    subjectFocusFromUi,
    subjectFocusToUi,
} from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    buildConfigFromState,
    buildCatalog,
    stateFromConfig,
} from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import {
    applyEnrollmentStarterTemplate,
    buildDefaultQueueRowSurfaceEnvelope,
    createQueueRowVariant,
    queueRowSurfaceHasConfiguredColumns,
    QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { formatVariantStageRuleSummary } from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";

const builderSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)), "utf8");
const editorSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowSurfaceEditor.tsx", import.meta.url)), "utf8");
const variantInspectorSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowVariantInspector.tsx", import.meta.url)), "utf8");
const libraryPanelSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowItemLibraryPanel.tsx", import.meta.url)), "utf8");
const canvasRegionsSrc = readFileSync(fileURLToPath(new URL("../../lib/adminV2/settings/surfaces/queueRowCanvasRegions.ts", import.meta.url)), "utf8");

describe("queue row builder editing canvas", () => {
    it("uses runtime 440px rail and shared row shell", () => {
        expect(ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX).toBe(440);
        expect(builderSrc).toContain("QUEUE_ROW_BUILDER_SHELL_DATA_ATTR");
        expect(builderSrc).not.toContain('canvasPresentation === "preview-only"');
    });

    it("canvas exposes generic slots only", () => {
        expect(CANVAS_PLACEMENT_REGIONS.map((r) => r.label)).toEqual([
            "Primary",
            "Secondary",
            "Supporting",
            "Right",
            "Bottom",
        ]);
        expect(canvasAffordanceLabel("identity")).toBe("+ Primary");
        expect(builderSrc).toContain("CANVAS_PLACEMENT_REGIONS");
        expect(builderSrc).not.toContain("+ Add family identity");
        expect(canvasRegionsSrc).not.toContain("isWaitlistPresentationVariant");
    });

    it("operator-assigned canvasSlot wins over zone defaults", () => {
        expect(regionForZoneState({ key: "children", inRow: true, canvasSlot: "identity" })).toBe("identity");
        expect(regionForZoneState({ key: "household", inRow: true, canvasSlot: "identity" })).toBe("identity");
    });

    it("row focus prioritizes library without hiding categories", () => {
        expect(variantInspectorSrc).toContain("Prioritizes library suggestions");
        const categories = libraryItemsByCategory(buildQueueRowLibraryCatalog({ isWaitlist: false, inRowZoneKeys: [] }));
        expect(prioritizeLibraryForRowFocus(categories, "child")[0]?.key).toBe("child");
        expect(prioritizeLibraryForRowFocus(categories, "family")[0]?.key).toBe("family_parents");
    });

    it("waitlist fields appear from process context", () => {
        expect(
            resolveQueueRowLibraryIsWaitlist({ processStages: [{ value: "waitlist", label: "Waitlist" }] }),
        ).toBe(true);
        expect(processHasWaitlistStages([{ value: "new_lead", label: "New Leads" }])).toBe(false);
    });

    it("library panel is slot-driven with search", () => {
        expect(libraryPanelSrc).toContain("targetRegion");
        expect(libraryPanelSrc).toContain("data-library-search");
        expect(libraryPanelSrc).toContain("prioritizeLibraryForRowFocus");
    });

    it("blank default and optional starter template", () => {
        expect(blankPreviewRowModel().context?.primary_contact).toBeNull();
        expect(QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE).toContain("Add at least one item");
        expect(queueRowSurfaceHasConfiguredColumns(buildDefaultQueueRowSurfaceEnvelope({ catalogId: "x", processKey: "enrollment", processName: "E" }).layout)).toBe(false);
        expect(validateQueueRecordLayoutConfig(emptyQueueRowLayoutV3()).ok).toBe(false);
        expect(createQueueRowVariant({ label: "Custom", priority: 10 }).columns).toEqual([]);
        const templated = applyEnrollmentStarterTemplate(emptyQueueRowLayoutV3());
        expect(templated.variants?.every((v) => v.columns.length === 0)).toBe(true);
        expect(editorSrc).toContain("Use suggested template");
    });

    it("builderSlot persists and maps to runtime compact slots", () => {
        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        let zones = stateFromConfig(base, catalog, false);
        zones = zones.map((z) =>
            z.key === "children"
                ? {
                      ...z,
                      inRow: true,
                      canvasSlot: "identity" as const,
                      evidenceGroups: z.evidenceGroups.map((g) => ({
                          ...g,
                          enabled: true,
                          fields: g.fields.map((f) =>
                              f.fieldKey === "child.name" ? { ...f, enabled: true } : f,
                          ),
                      })),
                  }
                : z,
        );
        const config = buildConfigFromState(base, zones, catalog);
        expect(config.columns.some((c) => c.builderSlot === "identity")).toBe(true);
        expect(mapQueueRowSurfaceToCompactConfig(config).fallbackSlots).not.toContain("subject");
    });

    it("variant stage summary and row focus mapping", () => {
        expect(formatVariantStageRuleSummary(["waiting"], [{ value: "waiting", label: "Waiting" }])).toBe("Waiting");
        expect(subjectFocusToUi("placement_candidate_child")).toBe("child");
        expect(subjectFocusFromUi("child", ["waiting"])).toBe("placement_candidate_child");
        expect(queueRowZoneLabel("household")).toBe("Family / Parents");
    });
});
