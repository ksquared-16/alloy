/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import {
    buildQueueRowLibraryCatalog,
    libraryItemsByCategory,
    queueRowZoneLabel,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import {
    regionForZoneState,
} from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import {
    blankPreviewRowModel,
    previewRowModelFromConfig,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import {
    processHasWaitlistStages,
    resolveQueueRowLibraryIsWaitlist,
} from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    buildConfigFromState,
    buildCatalog,
    stateFromConfig,
} from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import {
    buildDefaultQueueRowSurfaceEnvelope,
    createQueueRowVariant,
    queueRowSurfaceHasConfiguredColumns,
    QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { SURFACE_FIELD_INSPECTOR_ATTRS } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

const builderSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)), "utf8");
const editorSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowSurfaceEditor.tsx", import.meta.url)), "utf8");
const hintSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowCanvasHint.tsx", import.meta.url)), "utf8");
const libraryPanelSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowItemLibraryPanel.tsx", import.meta.url)), "utf8");
const variantSettingsSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowVariantSettings.tsx", import.meta.url)), "utf8");

describe("queue row builder editing canvas", () => {
    it("uses runtime 440px rail and shared row shell", () => {
        expect(ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX).toBe(440);
        expect(builderSrc).toContain("QUEUE_ROW_BUILDER_SHELL_DATA_ATTR");
        expect(builderSrc).toContain("CondensedQueueRow");
    });

    it("hides slot affordances and internal terminology from operator UI", () => {
        expect(builderSrc).not.toContain("data-canvas-region-affordance");
        expect(builderSrc).not.toContain("+ Primary");
        expect(builderSrc).not.toContain("+ Add family identity");
        expect(builderSrc).not.toContain("Evidence groups");
        expect(builderSrc).not.toContain("Row slot");
        expect(builderSrc).toContain("Click to add content");
        expect(hintSrc).toContain("Click anywhere on the row to begin building");
    });

    it("operator-assigned canvasSlot still wins internally", () => {
        expect(regionForZoneState({ key: "children", inRow: true, canvasSlot: "identity" })).toBe("identity");
    });

    it("library panel is click-first with search", () => {
        expect(libraryPanelSrc).toContain("Add to row");
        expect(libraryPanelSrc).toContain("data-library-search");
        expect(libraryPanelSrc).not.toContain("Click a row slot");
        expect(libraryPanelSrc).not.toContain("targetRegion");
    });

    it("preview row reflects configured fields", () => {
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
        const preview = previewRowModelFromConfig(config);
        expect(preview.context?.row_subject.display_name).toBeTruthy();
        expect(blankPreviewRowModel().context?.primary_contact).toBeNull();
    });

    it("blank default and variant creation", () => {
        expect(QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE).toContain("Add at least one item");
        expect(queueRowSurfaceHasConfiguredColumns(buildDefaultQueueRowSurfaceEnvelope({ catalogId: "x", processKey: "enrollment", processName: "E" }).layout)).toBe(false);
        expect(validateQueueRecordLayoutConfig(emptyQueueRowLayoutV3()).ok).toBe(false);
        expect(createQueueRowVariant({ label: "Custom", priority: 10 }).columns).toEqual([]);
        expect(editorSrc).not.toContain("Use suggested template");
        expect(editorSrc).toContain('data-testid="queue-row-add-variant"');
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

    it("waitlist fields appear from process context", () => {
        expect(
            resolveQueueRowLibraryIsWaitlist({ processStages: [{ value: "waitlist", label: "Waitlist" }] }),
        ).toBe(true);
        expect(processHasWaitlistStages([{ value: "new_lead", label: "New Leads" }])).toBe(false);
    });

    it("uses operator-friendly zone labels", () => {
        expect(queueRowZoneLabel("household")).toBe("Family");
        expect(libraryItemsByCategory(buildQueueRowLibraryCatalog({ isWaitlist: false, inRowZoneKeys: [] })).length).toBeGreaterThan(0);
    });

    it("composer canvas keeps placed fields selectable with calm add affordance and inspector", () => {
        expect(builderSrc).toContain("SURFACE_FIELD_INSPECTOR_ATTRS.section");
        expect(builderSrc).toContain("SURFACE_FIELD_INSPECTOR_ATTRS.canvasFieldSelected");
        expect(builderSrc).toContain("SURFACE_FIELD_INSPECTOR_ATTRS.placement");
        expect(builderSrc).toContain("ComposerFieldChip");
        expect(builderSrc).toContain("data-canvas-line");
        expect(builderSrc).toContain("SURFACE_FIELD_INSPECTOR_ATTRS.canvasAddField");
        expect(builderSrc).not.toContain("+ Add next to this");
        expect(builderSrc).not.toContain("+ Add below");
        expect(builderSrc).toContain("data-inspector-field-list");
        expect(libraryPanelSrc).toContain("sectionLabel");
        expect(variantSettingsSrc).toContain('testId="queue-row-variant-group-by"');
        expect(builderSrc).not.toContain("QueueRowPlacementRankingEditor");
    });
});
