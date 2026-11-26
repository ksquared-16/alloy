import { describe, expect, it } from "vitest";

import {
    defaultSurfaceHeaderSummaryConfig,
    readSurfaceHeaderSummaryConfig,
    withSurfaceHeaderSummaryMetadata,
    addSurfaceHeaderRenderer,
    moveSurfaceHeaderRenderer,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import {
    addFocusPanelFieldFromLibrary,
    listPlacedFocusPanelFields,
    moveFocusPanelPlacedField,
    resolveDefaultAppendPlacement,
    seedFocusPanelComposerConfig,
} from "@/lib/adminV2/settings/surfaces/focusPanelComposerModel";
import { buildFocusPanelHeaderLibrary, buildFocusPanelLibraryForCard } from "@/lib/adminV2/settings/surfaces/focusPanelBuilderLibrary";
import {
    formatSurfaceHeaderSummaryLine,
    resolveSurfaceHeaderSummarySegments,
} from "@/lib/adminV2/runtime/surfaceHeader/resolveSurfaceHeaderSummary";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc } from "@/lib/layout/layoutV2";
import { FOCUS_PANEL_SUMMARY_ENTITY_TYPE, FOCUS_PANEL_SUMMARY_LAYOUT_KEY, FOCUS_PANEL_SUMMARY_SURFACE } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

describe("surfaceHeaderSummaryModel (focus panel adapter)", () => {
    it("reads and writes header summary config on layout doc metadata", () => {
        const config = defaultSurfaceHeaderSummaryConfig();
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: FOCUS_PANEL_SUMMARY_SURFACE,
            entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            sections: [],
            metadata: withSurfaceHeaderSummaryMetadata({ layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY }, config),
        };
        expect(readSurfaceHeaderSummaryConfig(doc)?.renderers).toHaveLength(2);
    });

    it("supports reorder and add renderer", () => {
        let config = defaultSurfaceHeaderSummaryConfig();
        config = addSurfaceHeaderRenderer(config, "status_summary");
        expect(config.renderers.some((r) => r.rendererKey === "status_summary")).toBe(true);
        const firstId = config.renderers[0]!.id;
        config = moveSurfaceHeaderRenderer(config, firstId, "later");
        expect(config.renderers[1]?.id).toBe(firstId);
    });
});

describe("resolveSurfaceHeaderSummary (focus panel runtime)", () => {
    it("resolves parent and children from inquiry record", () => {
        const record = {
            "person.primary_contact_name": "Kelly Kurzman",
            _inquiry_children: [
                { id: "c1", display_name: "Lennon Kurzman", age: "2y 3m" },
                { id: "c2", display_name: "Wrigley Kurzman", age: "3m" },
            ],
        };
        const segments = resolveSurfaceHeaderSummarySegments({ record, statusLabel: "Open" });
        expect(segments.length).toBeGreaterThan(0);
        const line = formatSurfaceHeaderSummaryLine(segments);
        expect(line).toContain("Kelly");
        expect(line).toContain("Lennon");
    });

    it("truncates long identity summary lines", () => {
        const segments = [{ id: "1", text: "A".repeat(150) }];
        const line = formatSurfaceHeaderSummaryLine(segments);
        expect(line!.length).toBeLessThanOrEqual(120);
        expect(line!.endsWith("…")).toBe(true);
    });
});

describe("focusPanelComposerModel", () => {
    it("lists placed fields from card config evidence groups", () => {
        const config = seedFocusPanelComposerConfig("household", {});
        const placed = listPlacedFocusPanelFields("household", config);
        expect(placed.length).toBeGreaterThan(0);
    });

    it("adds a field with section placement and respects line cap", () => {
        let config = seedFocusPanelComposerConfig("household", {
            evidenceGroups: [{ id: "g1", label: "Overview", fields: [] }],
        });
        const groupId = "g1";
        for (let i = 0; i < 3; i++) {
            config = addFocusPanelFieldFromLibrary(config, "household", {
                groupId,
                concept: `Enrollment → Field ${i}`,
                label: `Field ${i}`,
                placement: resolveDefaultAppendPlacement(listPlacedFocusPanelFields("household", config), "identity"),
            });
        }
        const append = resolveDefaultAppendPlacement(listPlacedFocusPanelFields("household", config), "identity");
        expect(append.stackLine).toBe(1);
        expect(append.inlineWithPrevious).toBe(false);
    });

    it("persists section moves on fieldPlacements", () => {
        let config = seedFocusPanelComposerConfig("household", {});
        const fieldId = config.evidenceGroups?.[0]?.fields[0]?.id;
        expect(fieldId).toBeTruthy();
        config = moveFocusPanelPlacedField(config, fieldId!, { builderSlot: "status" });
        const placed = listPlacedFocusPanelFields("household", config);
        expect(placed.find((f) => f.fieldId === fieldId)?.builderSlot).toBe("status");
    });
});

describe("focusPanelBuilderLibrary", () => {
    it("builds registry-backed library for household card", () => {
        const items = buildFocusPanelLibraryForCard("household");
        expect(items.length).toBeGreaterThan(0);
        expect(items.every((i) => i.kind === "field")).toBe(true);
    });

    it("builds identity renderer library", () => {
        const items = buildFocusPanelHeaderLibrary();
        expect(items.some((i) => i.rendererKey === "children_summary")).toBe(true);
    });
});

describe("Focus Panel composer shell (source guards)", () => {
    it("surface editor integrates composer primitives", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            resolve(here, "../../components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx"),
            "utf8",
        );
        expect(src).toContain("SurfaceItemLibraryPanel");
        expect(src).toContain("SurfaceFieldInspector");
        expect(src).toContain("SurfaceHeaderSummaryEditor");
        expect(src).toContain("SURFACE_COMPOSER_EMPTY_HINT");
    });

    it("compact header removes close button", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(resolve(here, "../../components/admin/focusPanel/FocusPanelCompactHeader.tsx"), "utf8");
        expect(src).not.toContain("data-focus-panel-close");
        expect(src).not.toContain("onClose");
    });

    it("focus panel opens full-bleed surface editor shell", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            resolve(here, "../../components/adminV2/settings/surfaces/FocusPanelSurfaceEditor.tsx"),
            "utf8",
        );
        expect(src).toContain("focus-panel-surface-back");
        expect(src).toContain("FocusPanelSummarySurfaceEditor");
    });

    it("inline focus panel prewarms activity mode", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            resolve(here, "../../components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"),
            "utf8",
        );
        expect(src).toContain("useFocusPanelModePrewarm");
        expect(src).toContain("scheduleOpportunityDrawerTabPrefetch");
    });
});
