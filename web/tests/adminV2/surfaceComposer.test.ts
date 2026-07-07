import { describe, expect, it } from "vitest";

import {
    SURFACE_COMPOSER_EMPTY_HINT,
    SURFACE_HEADER_SUMMARY_METADATA_KEY,
    defaultSurfaceHeaderSummaryConfig,
    readSurfaceHeaderSummaryConfig,
    resolveSurfaceComposerDefaultAppendPlacement,
    withSurfaceHeaderSummaryMetadata,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import { LEGACY_FOCUS_PANEL_IDENTITY_SUMMARY_METADATA_KEY } from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";
import {
    formatSurfaceHeaderSummaryLine,
    resolveSurfaceHeaderSummarySegments,
} from "@/lib/adminV2/runtime/surfaceHeader/resolveSurfaceHeaderSummary";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc } from "@/lib/layout/layoutV2";
import {
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

describe("surfaceComposer platform", () => {
    it("exports shared empty hint for all surfaces", () => {
        expect(SURFACE_COMPOSER_EMPTY_HINT).toContain("Click the surface");
    });

    it("resolves default append placement with line cap", () => {
        const placed = [
            { fieldId: "a", label: "A", builderSlot: "identity" as const, stackLine: 0, inlineWithPrevious: false },
            { fieldId: "b", label: "B", builderSlot: "identity" as const, stackLine: 0, inlineWithPrevious: true },
            { fieldId: "c", label: "C", builderSlot: "identity" as const, stackLine: 0, inlineWithPrevious: true },
        ];
        const append = resolveSurfaceComposerDefaultAppendPlacement(placed, "identity");
        expect(append.stackLine).toBe(1);
        expect(append.inlineWithPrevious).toBe(false);
    });
});

describe("surfaceHeaderSummaryModel", () => {
    it("reads primary metadata key on publish", () => {
        const config = defaultSurfaceHeaderSummaryConfig();
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: FOCUS_PANEL_SUMMARY_SURFACE,
            entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            sections: [],
            metadata: withSurfaceHeaderSummaryMetadata({ layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY }, config),
        };
        expect(doc.metadata?.[SURFACE_HEADER_SUMMARY_METADATA_KEY]).toBeTruthy();
        expect(readSurfaceHeaderSummaryConfig(doc)?.renderers.length).toBeGreaterThan(0);
    });

    it("reads legacy focusPanelIdentitySummary for backward compatibility", () => {
        const config = defaultSurfaceHeaderSummaryConfig();
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: FOCUS_PANEL_SUMMARY_SURFACE,
            entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            sections: [],
            metadata: { [LEGACY_FOCUS_PANEL_IDENTITY_SUMMARY_METADATA_KEY]: config },
        };
        expect(readSurfaceHeaderSummaryConfig(doc)?.renderers.length).toBe(2);
    });
});

describe("resolveSurfaceHeaderSummary", () => {
    it("formats enrollment-style parent and children line", () => {
        const record = {
            "person.primary_contact_name": "Kelly Kurzman",
            _inquiry_children: [
                { id: "c1", display_name: "Lennon Kurzman", age: "2y 3m" },
                { id: "c2", display_name: "Wrigley Kurzman", age: "3m" },
            ],
        };
        const segments = resolveSurfaceHeaderSummarySegments({ record, statusLabel: "Open" });
        const line = formatSurfaceHeaderSummaryLine(segments);
        expect(line).toContain("Kelly");
        expect(line).toContain("Lennon");
    });
});

describe("shared composer components (source guards)", () => {
    it("Focus Panel surface editor consumes Surface Composer primitives", async () => {
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
        expect(src).not.toContain("FocusPanelItemLibraryPanel");
    });

    it("Queue Row builder remains frozen — no imports from focus panel composer", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            resolve(here, "../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx"),
            "utf8",
        );
        expect(src).not.toContain("focusPanelComposer");
        expect(src).not.toContain("SurfaceHeaderSummaryEditor");
    });
});
