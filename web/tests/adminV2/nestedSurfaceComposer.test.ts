/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";

import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    moveFieldInNestedGroup,
    removeFieldFromNestedGroup,
    CHILDREN_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    buildNestedSurfaceLibraryForGroup,
    nestedSurfaceLibraryCategories,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceBuilderLibrary";
import {
    listNestedPlacedFields,
    nestedPlacedFieldId,
    toSurfaceComposerPlacedItemRef,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceComposerModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

const here = dirname(fileURLToPath(import.meta.url));
function readSrc(rel: string): string {
    return readFileSync(resolve(here, "../../", rel), "utf8");
}

describe("nestedSurfaceComposerModel", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("lists placed fields with stable ids", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const groupKey = config.groups[0]!.key;
        const placed = listNestedPlacedFields(CHILDREN_SURFACE_ID, groupKey, config);
        expect(placed.length).toBeGreaterThan(0);
        expect(placed[0]!.id).toBe(nestedPlacedFieldId(groupKey, placed[0]!.fieldKey));
    });

    it("maps to shared SurfaceComposerPlacedItemRef", () => {
        const ref = {
            id: "placement:child.room",
            groupKey: "placement",
            fieldKey: "child.room",
            label: "Room",
        };
        const mapped = toSurfaceComposerPlacedItemRef(ref);
        expect(mapped.fieldId).toBe("child.room");
        expect(mapped.label).toBe("Room");
    });

    it("add, reorder, and remove round-trip through model ops", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const groupKey = config.groups[0]!.key;
        config = addFieldToNestedGroup(config, groupKey, "child.room");
        const placed = listNestedPlacedFields(CHILDREN_SURFACE_ID, groupKey, config);
        const lastKey = placed[placed.length - 1]!.fieldKey;
        config = moveFieldInNestedGroup(config, groupKey, lastKey, -1);
        config = removeFieldFromNestedGroup(config, groupKey, lastKey);
        expect(listNestedPlacedFields(CHILDREN_SURFACE_ID, groupKey, config).some((f) => f.fieldKey === lastKey)).toBe(false);
    });
});

describe("nestedSurfaceBuilderLibrary", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("builds library items for a group excluding already-selected fields", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const groupKey = config.groups[0]!.key;
        const items = buildNestedSurfaceLibraryForGroup(CHILDREN_SURFACE_ID, groupKey, config);
        const selected = new Set(config.groups[0]!.selectedFieldKeys);
        expect(items.every((i) => !selected.has(i.fieldKey))).toBe(true);
        expect(nestedSurfaceLibraryCategories(items).length).toBeGreaterThan(0);
    });
});

describe("NestedSurfaceEditor — Surface Composer convergence (source guards)", () => {
    it("uses shared library, inspector, and canvas composer primitives", () => {
        const src = readSrc("components/adminV2/settings/surfaces/NestedSurfaceEditor.tsx");
        expect(src).toContain("NestedSurfaceRuntimeCanvas");
        expect(src).toContain("NestedSurfaceGroupInspector");
        expect(src).toContain("SURFACE_COMPOSER_EMPTY_HINT");
        expect(src).not.toContain("addOpenGroup");
        expect(src).not.toContain("data-nested-add-picker");
        expect(src).not.toContain("NestedSurfaceFieldComposer");
    });

    it("Surfaces page passes drill-in context and back navigation", () => {
        const page = readSrc("components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx");
        expect(page).toContain("onBack={() =>");
        expect(page).toContain("onDrillInSurface");
        expect(page).toContain("FocusPanelSurfaceEditor");
        expect(page).toContain("nestedStack");
    });

    it("SurfaceFieldInspector supports nested variant", () => {
        const src = readSrc("components/adminV2/settings/surfaces/composer/SurfaceFieldInspector.tsx");
        expect(src).toContain('variant?: "full" | "nested"');
        expect(src).toContain('"nested-field"');
    });
});
