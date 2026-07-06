/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import {
    buildQueueRowLibraryCatalog,
    filterLibraryForTargetZone,
    libraryItemsByCategory,
    queueRowZoneLabel,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import { blankPreviewRowModel } from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import { subjectFocusFromUi, subjectFocusToUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    buildDefaultQueueRowSurfaceEnvelope,
    createQueueRowVariant,
    queueRowSurfaceHasConfiguredColumns,
    QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { formatVariantStageRuleSummary } from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";

const builderSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)), "utf8");
const editorSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowSurfaceEditor.tsx", import.meta.url)), "utf8");
const variantInspectorSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowVariantInspector.tsx", import.meta.url)), "utf8");
const libraryPanelSrc = readFileSync(fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowItemLibraryPanel.tsx", import.meta.url)), "utf8");

describe("queue row builder editing canvas", () => {
    it("uses runtime 440px rail and shared row shell", () => {
        expect(ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX).toBe(440);
        expect(builderSrc).toContain("QUEUE_ROW_BUILDER_SHELL_DATA_ATTR");
        expect(builderSrc).toContain("QUEUE_ROW_CARD_SHELL_CLASS");
        expect(builderSrc).not.toContain('canvasPresentation === "preview-only"');
    });

    it("Row focus label with Family / Child only; Candidate maps internally", () => {
        expect(variantInspectorSrc).toContain("Row focus");
        expect(variantInspectorSrc).not.toContain("Subject focus");
        expect(variantInspectorSrc).not.toContain("Candidate");
        expect(subjectFocusToUi("placement_candidate_child")).toBe("child");
        expect(subjectFocusFromUi("child", ["waiting"])).toBe("placement_candidate_child");
    });

    it("operator labels avoid Household as primary section name", () => {
        expect(queueRowZoneLabel("household")).toBe("Family / Parents");
    });

    it("library groups by semantic category", () => {
        expect(libraryPanelSrc).toContain("libraryItemsByCategory");
        const categories = libraryItemsByCategory(buildQueueRowLibraryCatalog({ isWaitlist: false, inRowZoneKeys: [] }));
        expect(categories.map((c) => c.label)).toContain("Family / Parents");
        expect(categories.map((c) => c.label)).toContain("Child");
    });

    it("selected zone controls placement", () => {
        expect(builderSrc).toContain("libraryTargetZone ?? selectedKey");
        expect(libraryPanelSrc).toContain("data-library-placement-prompt");
    });

    it("variant rules use Applies when / Match stages", () => {
        expect(variantInspectorSrc).toContain("Applies when");
        expect(variantInspectorSrc).toContain("Match stages");
        expect(editorSrc).toContain("Used when no stage-specific variant matches");
        const summary = formatVariantStageRuleSummary(["waiting"], [{ value: "waiting", label: "Waiting" }]);
        expect(summary).toBe("Waiting");
    });

    it("blank canvas affordances and publish guard", () => {
        expect(builderSrc).toContain("+ Add family identity");
        expect(blankPreviewRowModel().context?.primary_contact).toBeNull();
        expect(QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE).toContain("Add at least one item");
        expect(queueRowSurfaceHasConfiguredColumns(buildDefaultQueueRowSurfaceEnvelope({ catalogId: "x", processKey: "enrollment", processName: "E" }).layout)).toBe(false);
        expect(validateQueueRecordLayoutConfig(emptyQueueRowLayoutV3()).ok).toBe(false);
    });

    it("filterLibraryForTargetZone scopes to drop target", () => {
        const items = buildQueueRowLibraryCatalog({ isWaitlist: false, inRowZoneKeys: [] });
        expect(filterLibraryForTargetZone(items, "household").every((i) => i.zoneKey === "household" || i.kind === "zone")).toBe(true);
    });
});
