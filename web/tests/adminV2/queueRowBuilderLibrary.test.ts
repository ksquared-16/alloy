/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { availableFieldsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import {
    buildQueueRowLibraryCatalog,
    libraryItemsByCategory,
    QUEUE_ROW_UNAVAILABLE_CHILD_PROFILE_LIBRARY,
    QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import { subjectFocusFromUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    SURFACE_FIELD_PLACEMENT_HELP,
    SURFACE_FIELD_SECTION_LABELS,
} from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";
import { movePlacedField } from "@/lib/adminV2/settings/surfaces/queueRowComposerModel";

const builderSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)),
    "utf8",
);
const libraryPanelSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowItemLibraryPanel.tsx", import.meta.url)),
    "utf8",
);

describe("queue row builder library", () => {
    it("includes children vocabulary fields in the child category", () => {
        const items = buildQueueRowLibraryCatalog({
            isWaitlist: false,
            inRowZoneKeys: ["children", "status", "household"],
        });
        const childCategory = libraryItemsByCategory(items).find((c) => c.key === "child");
        const fieldKeys = childCategory?.items
            .filter((item) => item.kind === "field")
            .map((item) => item.fieldKey) ?? [];
        expect(fieldKeys).toContain("child.name");
        expect(fieldKeys).toContain("children");
        expect(fieldKeys).toContain("children.count");
        expect(fieldKeys).toContain("children.names");
        expect(fieldKeys).toContain("children.summary");
    });

    it("child category includes compact-effective child and waitlist fields only", () => {
        const items = buildQueueRowLibraryCatalog({
            isWaitlist: true,
            includeWaitlistFields: true,
            inRowZoneKeys: ["children", "status", "household"],
        });
        const childCategory = libraryItemsByCategory(items).find((c) => c.key === "child");
        const fieldKeys = childCategory?.items
            .filter((item) => item.kind === "field")
            .map((item) => item.fieldKey) ?? [];
        expect(fieldKeys).toContain("child.name");
        expect(fieldKeys).toContain("children");
        expect(fieldKeys).toContain("children.count");
        expect(fieldKeys).toContain("inquiry_child.program");
        expect(fieldKeys).toContain("inquiry_child.program_category");
        expect(fieldKeys).toContain("child.room");
        expect(fieldKeys).toContain("child.date_of_birth");
        expect(fieldKeys).not.toContain("child.start_date");
        // Sibling vocabulary is not yet compact-effective — omit until restored.
        expect(fieldKeys).not.toContain("sibling.names");
    });

    it("does not show placeholder unavailable entries once registry is complete", () => {
        expect(QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY).toEqual([]);
    });

    it("does not show resolver-backed child profile fields as unavailable in the library", () => {
        expect(QUEUE_ROW_UNAVAILABLE_CHILD_PROFILE_LIBRARY).toEqual([]);
    });

    it("scopes sibling fields to waitlist surfaces in the library", () => {
        const pipelineOnly = buildQueueRowLibraryCatalog({
            isWaitlist: false,
            inRowZoneKeys: ["children"],
        });
        const pipelineFieldKeys = pipelineOnly
            .filter((item) => item.kind === "field")
            .map((item) => item.fieldKey);
        expect(pipelineFieldKeys).not.toContain("sibling.names");
        expect(pipelineFieldKeys).not.toContain("waitlist.siblingContext");

        const unavailable = pipelineOnly.filter((item) => item.kind === "unavailable");
        // Unsupported / waitlist-only fields are hidden entirely — not grayed as unavailable.
        expect(unavailable).toEqual([]);
        expect(pipelineFieldKeys).not.toContain("sibling.names");
    });

    it("children zone registry exposes expanded child field keys", () => {
        const fields = availableFieldsForZone("children", true);
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("child.dob_age");
        expect(keys).toContain("child.location");
        expect(keys).toContain("inquiry_child.program_category");
        expect(keys).toContain("waitlist.siblingContext");
    });
});

describe("surface field composer interaction", () => {
    it("builder uses single canvas representation and inline add placement", () => {
        expect(builderSrc).toContain("blankPreviewRowModel()");
        expect(builderSrc).not.toContain("opacity-[0.22]");
        expect(builderSrc).toContain("ComposerAddFieldButton");
        expect(builderSrc).toContain("showInlineAdd");
        expect(builderSrc).toContain(SURFACE_FIELD_SECTION_LABELS.identity);
        expect(builderSrc).toContain("Section");
        expect(builderSrc).toContain("Placement");
        expect(builderSrc).toContain("SURFACE_FIELD_PLACEMENT_HELP");
        expect(builderSrc).toContain("data-row-focus-help");
        expect(libraryPanelSrc).toContain("SURFACE_FIELD_ROW_FOCUS_HELP");
        expect(libraryPanelSrc).toContain("data-library-scroll");
        expect(libraryPanelSrc).toContain("min-h-0 flex-1 overflow-y-auto");
    });

    it("row focus persists as library context only and does not remap layout", () => {
        const focus = subjectFocusFromUi("child", ["waitlist"]);
        expect(focus).toBe("placement_candidate_child");
        expect(movePlacedField).toBeDefined();
    });
});
