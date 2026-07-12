import { describe, expect, it } from "vitest";

import {
    defaultNestedSurfaceConfig,
    applyNestedSurfaceFieldDrop,
    fieldLayoutWidthForNestedGroup,
    reconcileNestedSurfaceConfig,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
    setFieldLayoutWidthInNestedGroup,
    CHILDREN_SURFACE_ID,
    addFieldToNestedGroup,
    setNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { childrenFocusRowsFromNestedConfig } from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";

describe("nestedSurfaceFieldLayout", () => {
    it("pairs consecutive half-width fields on one row", () => {
        const keys = ["child.first_name", "child.last_name", "inquiry_child.program"];
        const layout = (key: string) =>
            key === "child.first_name" || key === "child.last_name" ? "half" as const : "full" as const;

        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([
            ["child.first_name", "child.last_name"],
            ["inquiry_child.program"],
        ]);
    });

    it("pairs DOB + age on the same row", () => {
        const keys = ["child.date_of_birth", "child.dob_age", "child.room"];
        const layout = (key: string) =>
            key === "child.date_of_birth" || key === "child.dob_age" ? "half" as const : "full" as const;

        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([
            ["child.date_of_birth", "child.dob_age"],
            ["child.room"],
        ]);
    });

    it("keeps schedule blocks on full rows even when marked half", () => {
        const keys = ["inquiry_child.schedule_type", "child.start_date"];
        const layout = () => "half" as const;

        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([
            ["inquiry_child.schedule_type"],
            ["child.start_date"],
        ]);
    });

    it("persists field layout widths through reconcile", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.first_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.last_name", "half");

        const reconciled = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, config);
        expect(fieldLayoutWidthForNestedGroup(reconciled, "identity", "child.first_name")).toBe("half");
        expect(fieldLayoutWidthForNestedGroup(reconciled, "identity", "child.last_name")).toBe("half");
    });

    it("surfaces layout width on children focus rows after publish-shaped config", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.first_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.last_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.preferred_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.nickname", "half");

        const rows = childrenFocusRowsFromNestedConfig(reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, config));
        const first = rows.find((row) => row.fieldKey === "child.first_name");
        const last = rows.find((row) => row.fieldKey === "child.last_name");
        const preferred = rows.find((row) => row.fieldKey === "child.preferred_name");
        const nickname = rows.find((row) => row.fieldKey === "child.nickname");

        expect(first?.layoutWidth).toBe("half");
        expect(last?.layoutWidth).toBe("half");
        expect(preferred?.layoutWidth).toBe("half");
        expect(nickname?.layoutWidth).toBe("half");
    });

    it("pairs fields when dragged beside each other", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = applyNestedSurfaceFieldDrop(config, "identity", "child.first_name", "child.last_name", "beside");
        expect(fieldLayoutWidthForNestedGroup(config, "identity", "child.first_name")).toBe("half");
        expect(fieldLayoutWidthForNestedGroup(config, "identity", "child.last_name")).toBe("half");
        const keys = config.groups.find((g) => g.key === "identity")?.selectedFieldKeys ?? [];
        expect(keys.indexOf("child.first_name")).toBeGreaterThan(keys.indexOf("child.last_name"));
        const rows = chunkNestedSurfaceFieldsForHalfRowLayout(keys, (k) =>
            fieldLayoutWidthForNestedGroup(config, "identity", k),
        );
        expect(rows).toContainEqual(["child.last_name", "child.first_name"]);
    });

    it("pairs preferred name and nickname when dragged beside each other", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = applyNestedSurfaceFieldDrop(config, "identity", "child.nickname", "child.preferred_name", "beside");
        expect(fieldLayoutWidthForNestedGroup(config, "identity", "child.preferred_name")).toBe("half");
        expect(fieldLayoutWidthForNestedGroup(config, "identity", "child.nickname")).toBe("half");
    });

    it("stacks a field on a new full row when dropped below", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.first_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.last_name", "half");
        config = applyNestedSurfaceFieldDrop(config, "identity", "child.dob_age", "child.last_name", "below");
        expect(fieldLayoutWidthForNestedGroup(config, "identity", "child.dob_age")).toBe("full");
    });

    it("removes a full-width field from a group", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = removeFieldFromNestedGroup(config, "identity", "child.nickname");
        const keys = selectedFieldKeys(config, "identity");
        expect(keys).not.toContain("child.nickname");
    });

    it("removes one half-row field and promotes the survivor to full width", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = applyNestedSurfaceFieldDrop(config, "identity", "child.first_name", "child.last_name", "beside");
        config = removeFieldFromNestedGroup(config, "identity", "child.last_name");
        expect(selectedFieldKeys(config, "identity")).toContain("child.first_name");
        expect(selectedFieldKeys(config, "identity")).not.toContain("child.last_name");
        expect(fieldLayoutWidthForNestedGroup(config, "identity", "child.first_name")).toBe("full");
    });

    it("removes evidence section fields without leaving orphan half widths", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setNestedGroupEnabled(config, "medical", true, { sectionSemantic: "medical" });
        config = setFieldLayoutWidthInNestedGroup(config, "medical", "child.medical_summary", "half");
        config = addFieldToNestedGroup(config, "medical", "child.nickname");
        config = setFieldLayoutWidthInNestedGroup(config, "medical", "child.nickname", "half");
        config = removeFieldFromNestedGroup(config, "medical", "child.nickname");
        expect(fieldLayoutWidthForNestedGroup(config, "medical", "child.medical_summary")).toBe("full");
    });
});
